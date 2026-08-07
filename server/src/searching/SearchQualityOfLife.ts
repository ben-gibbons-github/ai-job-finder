import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import scrapedEmployerCache, { getOrCreateEmployer } from '../scraping/ScrapedEmployerCache.js'
import { askGeminiWithSearch } from '../llms/AskLLM.js'
import { setActiveOperation, clearActiveOperation } from '../utils/ServerActivityTracker.js'

const inFlightQualityOfLife = new Set<string>()

export interface QualityOfLifeResult {
  employeeQualityOfLifeScore: number
  employeeQualityOfLifeSummary: string
  error?: string
}

const qualityOfLifeCompletionCallbacks = new Map<string, Array<(r: QualityOfLifeResult) => void>>()

function fireQualityOfLifeCallbacks(jobKey: string, result: QualityOfLifeResult): void {
  const callbacks = qualityOfLifeCompletionCallbacks.get(jobKey)
  if (callbacks) {
    qualityOfLifeCompletionCallbacks.delete(jobKey)
    for (const cb of callbacks) cb(result)
  }
}

const ENABLE_TEMP_LLM_CONCURRENCY_CAP = true
const TEMP_MAX_SIMULTANEOUS_LLM_QOL_CALLS = 3
const QUOTA_WARN_LOG_INTERVAL_MS = 15_000
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

let activeLlmQolCalls = 0
const pendingLlmQolQueue: Array<() => void> = []
let lastQuotaWarnAt = 0

function isQuotaError(error: unknown): boolean {
  const text = String(error).toLowerCase()
  return (
    text.includes('resource_exhausted') ||
    text.includes('quota exceeded') ||
    text.includes('request failed (429)')
  )
}

function clampToPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }
  return text.slice(start, end + 1)
}

function parseQualityOfLifeRatings(
  responseText: string,
): { employeeQualityOfLifeScore: number; employeeQualityOfLifeSummary: string } | null {
  const jsonSlice = extractJsonObject(responseText)
  if (!jsonSlice) {
    return null
  }

  try {
    const parsed = JSON.parse(jsonSlice) as {
      employeeQualityOfLifeScore?: unknown
      employeeQualityOfLifeSummary?: unknown
      score?: unknown
      summary?: unknown
    }

    const employeeQualityOfLifeScore = clampToPercent(Number(parsed.employeeQualityOfLifeScore ?? parsed.score))
    const summaryRaw = parsed.employeeQualityOfLifeSummary ?? parsed.summary
    const employeeQualityOfLifeSummary = typeof summaryRaw === 'string' ? summaryRaw.trim() : ''

    return { employeeQualityOfLifeScore, employeeQualityOfLifeSummary }
  } catch {
    return null
  }
}

function getEmployerQualityOfLifeKey(job: ScrapedJob): string {
  const employer = getOrCreateEmployer(job)
  return String(employer.name ?? '').trim().toLowerCase()
}

function isFailedQualityOfLifeText(summary: string | undefined | null): boolean {
  if (typeof summary !== 'string') {
    return false
  }

  const normalized = summary.trim().toLowerCase()
  return normalized === 'searchqualityoflife failed' || normalized.includes('searchqualityoflife failed')
}

function ensureQualityOfLifeFields(job: ScrapedJob): void {
  const employer = getOrCreateEmployer(job)
  if (typeof employer.employeeQualityOfLifeSummary !== 'string') {
    employer.employeeQualityOfLifeSummary = ''
  }
  if (typeof employer.employeeQualityOfLifeScore !== 'number' || !Number.isFinite(employer.employeeQualityOfLifeScore)) {
    employer.employeeQualityOfLifeScore = 0
  }
}

function clearFailedQualityOfLife(job: ScrapedJob): void {
  const employer = getOrCreateEmployer(job)
  employer.employeeQualityOfLifeScore = 0
  employer.employeeQualityOfLifeSummary = ''
  scrapedEmployerCache.setCachedEmployer(employer)
}

function runWithLlmConcurrencyCap(runQol: () => void): void {
  if (!ENABLE_TEMP_LLM_CONCURRENCY_CAP) {
    runQol()
    return
  }

  const launch = () => {
    activeLlmQolCalls += 1
    runQol()
  }

  if (activeLlmQolCalls < TEMP_MAX_SIMULTANEOUS_LLM_QOL_CALLS) {
    launch()
    return
  }

  pendingLlmQolQueue.push(launch)
}

function releaseLlmConcurrencySlot(): void {
  if (!ENABLE_TEMP_LLM_CONCURRENCY_CAP) {
    return
  }

  activeLlmQolCalls = Math.max(0, activeLlmQolCalls - 1)
  const next = pendingLlmQolQueue.shift()
  if (next) {
    next()
  }
}

export function qualityOfLifeJob(job: ScrapedJob, shouldLog = false, shouldLaunch = false): number {
  ensureQualityOfLifeFields(job)
  const jobKey = getEmployerQualityOfLifeKey(job)
  const employer = getOrCreateEmployer(job)

  shouldLog = shouldLog && !IS_PRODUCTION

  if (isFailedQualityOfLifeText(employer.employeeQualityOfLifeSummary)) {
    if (shouldLog) {
      console.log(`[SearchQualityOfLife] Existing failed QoL result found for ${job.name}; deleting and retrying.`)
    }
    clearFailedQualityOfLife(job)
  }

  if (employer.employeeQualityOfLifeScore > 0 && employer.employeeQualityOfLifeSummary.trim().length > 0) {
    if (shouldLog) {
      console.log(`[SearchQualityOfLife] Existing QoL data found for employer ${employer.name}; skipping LLM call.`)
    }
    return clampToPercent(employer.employeeQualityOfLifeScore)
  }

  if (inFlightQualityOfLife.has(jobKey)) {
    if (shouldLog) {
      console.log(`[SearchQualityOfLife] QoL analysis already in flight for employer ${employer.name}; skipping duplicate launch.`)
    }
    return clampToPercent(employer.employeeQualityOfLifeScore)
  }

  if (!shouldLaunch) {
    return clampToPercent(employer.employeeQualityOfLifeScore)
  }

  const question = [
    'Perform a workplace quality-of-life background check for this job and return ONLY valid JSON.',
    '',
    'Score employee quality of life from 0 to 100 and summarize key evidence.',
    '',
    'Give HIGH marks for:',
    '- positive bosses and healthy manager behavior',
    '- career growth and mentorship',
    '- creative freedom and ownership',
    '- flexible schedule and sustainable pace',
    '- remote work support or hybrid flexibility',
    '- strong perks and employee benefits',
    '',
    'Give LOW marks for:',
    '- abusive bosses or intimidation',
    '- crunch culture and burnout expectations',
    '- toxic or hostile culture',
    '- repeated long-hours expectations',
    '',
    'JSON shape:',
    '{"employeeQualityOfLifeScore": number, "employeeQualityOfLifeSummary": "string"}',
    '',
    '## Role Details',
    `- Company: ${job.company_name}`,
    `- Title: ${job.name}`,
    `- Location: ${job.location}`,
    `- Job posting URL: ${job.source_url} (source: ${job.source})`,
    '',
    '## Job Description',
    `${job.description}`,
    '',
    'Be direct and evidence-based. Mention uncertainty when evidence is weak.',
  ].join('\n')

  if (shouldLog) {
    console.log(`[SearchQualityOfLife] Queuing QoL analysis for ${job.name} with question:\n${question}`)
  }

  inFlightQualityOfLife.add(jobKey)

  runWithLlmConcurrencyCap(() => {
    void (async () => {
      try {
        if (shouldLog) {
          console.log(`[SearchQualityOfLife] Asking Gemini with search for ${job.name}`)
        }
        const qolLabel = `gemini:qol ${String(job.company_name ?? '?')} | ${job.name}`
        setActiveOperation(qolLabel)
        const [result] = await askGeminiWithSearch([question], {
          systemInstruction:
            'You are a strict workplace quality-of-life analyst. Output compact JSON only.',
        })
        clearActiveOperation(qolLabel)

        const parsed = parseQualityOfLifeRatings(result.answer)
        if (!parsed) {
          throw new Error(
            IS_PRODUCTION
              ? `SearchQualityOfLife failed to parse Gemini response for job: ${job.name}`
              : `SearchQualityOfLife failed to parse Gemini response for job: ${job.name} ${result.answer}`
          )
        }

        employer.employeeQualityOfLifeScore = parsed.employeeQualityOfLifeScore
        employer.employeeQualityOfLifeSummary = parsed.employeeQualityOfLifeSummary
        scrapedEmployerCache.setCachedEmployer(employer)

        fireQualityOfLifeCallbacks(jobKey, {
          employeeQualityOfLifeScore: parsed.employeeQualityOfLifeScore,
          employeeQualityOfLifeSummary: parsed.employeeQualityOfLifeSummary,
        })

        if (shouldLog) {
          console.log(`[SearchQualityOfLife] QoL analysis complete for ${job.name}`, {
            employeeQualityOfLifeScore: parsed.employeeQualityOfLifeScore,
          })
        }
      } catch (error) {
        clearFailedQualityOfLife(job)
        fireQualityOfLifeCallbacks(jobKey, {
          employeeQualityOfLifeScore: 0,
          employeeQualityOfLifeSummary: '',
          error: String(error),
        })

        if (shouldLog) {
          if (isQuotaError(error)) {
            const now = Date.now()
            if (now - lastQuotaWarnAt >= QUOTA_WARN_LOG_INTERVAL_MS) {
              lastQuotaWarnAt = now
              console.warn('[SearchQualityOfLife] Gemini rate/quota limit reached. QoL calls will retry more slowly.')
            }
          } else {
            console.error(`[SearchQualityOfLife] QoL analysis failed for ${job.name}:`, error)
          }
        }
      } finally {
        inFlightQualityOfLife.delete(jobKey)
        releaseLlmConcurrencySlot()
      }
    })()
  })

  return clampToPercent(employer.employeeQualityOfLifeScore)
}

export function qualityOfLifeJobAsync(job: ScrapedJob, shouldLog = false): Promise<QualityOfLifeResult> {
  ensureQualityOfLifeFields(job)
  const jobKey = getEmployerQualityOfLifeKey(job)
  const employer = getOrCreateEmployer(job)

  if (isFailedQualityOfLifeText(employer.employeeQualityOfLifeSummary)) {
    clearFailedQualityOfLife(job)
  }

  if (employer.employeeQualityOfLifeScore > 0 && employer.employeeQualityOfLifeSummary.trim().length > 0) {
    return Promise.resolve({
      employeeQualityOfLifeScore: clampToPercent(employer.employeeQualityOfLifeScore),
      employeeQualityOfLifeSummary: employer.employeeQualityOfLifeSummary,
    })
  }

  return new Promise((resolve) => {
    const existing = qualityOfLifeCompletionCallbacks.get(jobKey) ?? []
    existing.push(resolve)
    qualityOfLifeCompletionCallbacks.set(jobKey, existing)
    qualityOfLifeJob(job, shouldLog, true)
  })
}
