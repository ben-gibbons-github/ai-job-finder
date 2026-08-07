import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import scrapedEmployerCache, { getOrCreateEmployer } from '../scraping/ScrapedEmployerCache.js'
import { askGeminiWithSearch } from '../llms/AskLLM.js'
import { setActiveOperation, clearActiveOperation } from '../utils/ServerActivityTracker.js'
import console from 'node:console'

const inFlightImpacts = new Set<string>()

export interface ImpactAIResult {
  impactScore: number
  impactSummary: string
  error?: string
}

const impactCompletionCallbacks = new Map<string, Array<(r: ImpactAIResult) => void>>()

function fireImpactCallbacks(impactKey: string, result: ImpactAIResult): void {
  const cbs = impactCompletionCallbacks.get(impactKey)
  if (cbs) {
    impactCompletionCallbacks.delete(impactKey)
    for (const cb of cbs) cb(result)
  }
}

const ENABLE_TEMP_LLM_CONCURRENCY_CAP = true
const TEMP_MAX_SIMULTANEOUS_LLM_IMPACT_CALLS = 3
const QUOTA_WARN_LOG_INTERVAL_MS = 15_000
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

let activeLlmImpactCalls = 0
const pendingLlmImpactQueue: Array<() => void> = []
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

function parseScore(value: unknown): number {
  if (typeof value === 'number') {
    return clampToPercent(value)
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/%/g, '').trim())
    return clampToPercent(parsed)
  }

  return clampToPercent(Number.NaN)
}

function parseImpactObject(input: unknown): { impactScore: number; impactSummary: string } | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const parsed = input as {
    impactScore?: unknown
    impact_score?: unknown
    score?: unknown
    impactSummary?: unknown
    impact_summary?: unknown
    summary?: unknown
  }

  const impactScore = parseScore(parsed.impactScore ?? parsed.impact_score ?? parsed.score)
  const impactSummaryRaw = typeof parsed.impactSummary === 'string'
    ? parsed.impactSummary
    : typeof parsed.impact_summary === 'string'
      ? parsed.impact_summary
      : typeof parsed.summary === 'string'
        ? parsed.summary
        : ''
  const impactSummary = impactSummaryRaw.trim()

  if (impactSummary.length === 0 && impactScore === 0) {
    return null
  }

  return { impactScore, impactSummary }
}

function extractBalancedJsonObjects(text: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      if (depth === 0) {
        start = i
      }
      depth += 1
      continue
    }

    if (ch === '}') {
      if (depth > 0) {
        depth -= 1
        if (depth === 0 && start !== -1) {
          blocks.push(text.slice(start, i + 1))
          start = -1
        }
      }
    }
  }

  return blocks
}

function parseFromJsonCandidates(responseText: string): { impactScore: number; impactSummary: string } | null {
  const candidates: string[] = []

  const fencedMatches = responseText.match(/```(?:json)?\s*([\s\S]*?)```/gi)
  if (fencedMatches) {
    for (const match of fencedMatches) {
      const cleaned = match.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
      if (cleaned.length > 0) {
        candidates.push(cleaned)
      }
    }
  }

  const balancedObjects = extractBalancedJsonObjects(responseText)
  candidates.push(...balancedObjects)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const normalized = parseImpactObject(parsed)
      if (normalized) {
        return normalized
      }
    } catch {
      // Try next candidate.
    }
  }

  return null
}

function parseFromRegexFallback(responseText: string): { impactScore: number; impactSummary: string } | null {
  const scoreMatch = responseText.match(/"?impactScore"?\s*[:=]\s*"?([0-9]+(?:\.[0-9]+)?)%?"?/i)
    ?? responseText.match(/impact\s*score\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)%?/i)
  const summaryMatch = responseText.match(/"?impactSummary"?\s*[:=]\s*"([\s\S]*?)"\s*(?:,|}|$)/i)
    ?? responseText.match(/"?summary"?\s*[:=]\s*"([\s\S]*?)"\s*(?:,|}|$)/i)

  const impactScore = scoreMatch ? parseScore(scoreMatch[1]) : 0
  const impactSummary = summaryMatch ? summaryMatch[1].trim() : ''

  if (impactSummary.length === 0 && impactScore === 0) {
    return null
  }

  return { impactScore, impactSummary }
}

function parseFromPlainTextFallback(responseText: string): { impactScore: number; impactSummary: string } | null {
  const cleaned = responseText
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) {
    return null
  }

  return {
    impactScore: 0,
    impactSummary: cleaned.slice(0, 1200),
  }
}

function parseImpactRatings(responseText: string): { impactScore: number; impactSummary: string } | null {
  const jsonCandidate = parseFromJsonCandidates(responseText)
  if (jsonCandidate) {
    return jsonCandidate
  }

  const regexCandidate = parseFromRegexFallback(responseText)
  if (regexCandidate) {
    return regexCandidate
  }

  return parseFromPlainTextFallback(responseText)
}

function getEmployerImpactKey(job: ScrapedJob): string {
  const employer = getOrCreateEmployer(job)
  return String(employer.name ?? '').trim().toLowerCase()
}

function isFailedImpactText(impactSummary: string | undefined | null): boolean {
  if (typeof impactSummary !== 'string') {
    return false
  }

  const normalized = impactSummary.trim().toLowerCase()
  return normalized === 'searchimpactai failed' || normalized.includes('searchimpactai failed')
}

function clearFailedImpact(job: ScrapedJob): void {
  const employer = getOrCreateEmployer(job)
  employer.ai_impact_score = 0
  employer.ai_impact_summary = ''
  scrapedEmployerCache.setCachedEmployer(employer)
}

function ensureImpactFields(job: ScrapedJob): void {
  const employer = getOrCreateEmployer(job)
  if (typeof employer.ai_impact_summary !== 'string') {
    employer.ai_impact_summary = ''
  }
  if (typeof employer.ai_impact_score !== 'number' || !Number.isFinite(employer.ai_impact_score)) {
    employer.ai_impact_score = 0
  }
}

function runWithLlmConcurrencyCap(runImpact: () => void): void {
  if (!ENABLE_TEMP_LLM_CONCURRENCY_CAP) {
    runImpact()
    return
  }

  const launch = () => {
    activeLlmImpactCalls += 1
    runImpact()
  }

  if (activeLlmImpactCalls < TEMP_MAX_SIMULTANEOUS_LLM_IMPACT_CALLS) {
    launch()
    return
  }

  pendingLlmImpactQueue.push(launch)
}

function releaseLlmConcurrencySlot(): void {
  if (!ENABLE_TEMP_LLM_CONCURRENCY_CAP) {
    return
  }

  activeLlmImpactCalls = Math.max(0, activeLlmImpactCalls - 1)
  const next = pendingLlmImpactQueue.shift()
  if (next) {
    next()
  }
}

export function impactJobAI(job: ScrapedJob, shouldLog = false, shouldLaunch = false): number {
  ensureImpactFields(job)
  const impactKey = getEmployerImpactKey(job)
  const employer = getOrCreateEmployer(job)

  if (employer.ai_impact_summary.trim().length > 0) {
    if (isFailedImpactText(employer.ai_impact_summary)) {
      clearFailedImpact(job)
    } else {
      return clampToPercent(employer.ai_impact_score)
    }
  }

  if (inFlightImpacts.has(impactKey)) {
    return clampToPercent(employer.ai_impact_score)
  }

  if (!shouldLaunch) {
    return clampToPercent(employer.ai_impact_score)
  }

  const question = [
    'Perform due diligence on this company and estimate REAL-WORLD POSITIVE IMPACT.',
    'Focus only on measurable net positive outcomes, not marketing claims.',
    '',
    'Positive impact categories:',
    '- communitySupport',
    '- socialJustice',
    '- education',
    '- mentalHealth',
    '- medicalLifeSaving',
    '- greenTechCarbonReduction',
    '- disabilityAccessibility',
    '- childProtection',
    '',
    'Also explicitly check for negatives:',
    '- money-first priorities',
    '- environmental harm',
    '- defense/surveillance/military use',
    '- harm to users or vulnerable groups',
    '- any harms to children',
    '',
    'Return ONLY valid JSON with this exact shape:',
    '{"impactSummary":"string","impactScore":number}',
    '',
    'Scoring guidance:',
    '- impactScore from 0 to 100.',
    '- 0 means no meaningful positive impact or net harmful.',
    '- 100 means exceptional and credible positive impact.',
    '- Penalize greenwashing and impact-washing.',
    '',
    'Role details:',
    `Company: ${job.company_name}`,
    `Title: ${job.name}`,
    `Location: ${job.location}`,
    `URL: ${job.source_url} (source: ${job.source})`,
    '',
    'Job description:',
    `${job.description}`,
  ].join('\n')

  if (!IS_PRODUCTION) {
    console.log('Initiating AI impact analysis for job:', job.name, 'with question:', question)
  }
  inFlightImpacts.add(impactKey)

  runWithLlmConcurrencyCap(() => {
    void (async () => {
      try {
        const impactLabel = `gemini:impact ${String(job.company_name ?? '?')} | ${job.name}`
        setActiveOperation(impactLabel)
        const [result] = await askGeminiWithSearch([question], {
          systemInstruction:
            'You are a strict impact due-diligence analyst. Use web evidence and output compact JSON only.',
        })
        clearActiveOperation(impactLabel)

        const parsed = parseImpactRatings(result.answer)
        if (!parsed) {
          throw new Error(`SearchImpactAI failed to parse response for job: ${job.name}`)
        }

        if (!IS_PRODUCTION) {
          console.log('result.answer', result.answer)
          console.log('AI impact analysis completed for job:', job.name, 'result:', parsed)
        }
        employer.ai_impact_score = parsed.impactScore
        employer.ai_impact_summary = parsed.impactSummary
        scrapedEmployerCache.setCachedEmployer(employer)

        fireImpactCallbacks(impactKey, {
          impactScore: parsed.impactScore,
          impactSummary: parsed.impactSummary,
        })
      } catch (error) {
        fireImpactCallbacks(impactKey, {
          impactScore: clampToPercent(employer.ai_impact_score),
          impactSummary: employer.ai_impact_summary,
          error: String(error),
        })

        if (shouldLog) {
          if (isQuotaError(error)) {
            const now = Date.now()
            if (now - lastQuotaWarnAt >= QUOTA_WARN_LOG_INTERVAL_MS) {
              lastQuotaWarnAt = now
              console.warn('[SearchImpactAI] Gemini rate/quota limit reached. Impact calls will retry more slowly.')
            }
          } else {
            console.error(`[SearchImpactAI] Impact call failed for ${job.name}:`, error)
          }
        }
      } finally {
        inFlightImpacts.delete(impactKey)
        releaseLlmConcurrencySlot()
      }
    })()
  })

  return clampToPercent(employer.ai_impact_score)
}

export function impactJobAIAsync(job: ScrapedJob, shouldLog = false): Promise<ImpactAIResult> {
  ensureImpactFields(job)
  const impactKey = getEmployerImpactKey(job)
  const employer = getOrCreateEmployer(job)

  if (employer.ai_impact_summary.trim().length > 0) {
    console.log(`[SearchImpactAI] Returning existing impact for employer "${employer.name}" with score ${employer.ai_impact_score}`)
    if (isFailedImpactText(employer.ai_impact_summary)) {
      clearFailedImpact(job)
    } else {
      return Promise.resolve({
        impactScore: clampToPercent(employer.ai_impact_score),
        impactSummary: employer.ai_impact_summary,
      })
    }
  }

  console.log(`[SearchImpactAI] No existing impact found for employer "${employer.name}". Initiating new impact analysis.`)
  return new Promise((resolve) => {
    const existing = impactCompletionCallbacks.get(impactKey) ?? []
    existing.push(resolve)
    impactCompletionCallbacks.set(impactKey, existing)
    impactJobAI(job, shouldLog, true)
  })
}
