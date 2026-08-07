import type { ScrapedEmployer } from '../scraping/ScrapedEmployer.js'
import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import scrapedEmployerCache, { getOrCreateEmployer } from '../scraping/ScrapedEmployerCache.js'
import { askGeminiWithSearch } from '../llms/AskLLM.js'
import { setActiveOperation, clearActiveOperation } from '../utils/ServerActivityTracker.js'

const inFlightAudits = new Set<string>()

export interface AuditResult {
  auditScore: number
  auditText: string
  error?: string
}

const auditCompletionCallbacks = new Map<string, Array<(r: AuditResult) => void>>()

function fireAuditCallbacks(auditKey: string, result: AuditResult): void {
  const cbs = auditCompletionCallbacks.get(auditKey)
  if (cbs) {
    auditCompletionCallbacks.delete(auditKey)
    for (const cb of cbs) cb(result)
  }
}

const ENABLE_TEMP_LLM_CONCURRENCY_CAP = true
const TEMP_MAX_SIMULTANEOUS_LLM_AUDITS = 3
const QUOTA_WARN_LOG_INTERVAL_MS = 15_000
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

let activeLlmAuditCalls = 0
const pendingLlmAuditQueue: Array<() => void> = []
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

function parseAuditRatings(responseText: string): { jobQuality: number; redFlags: number; summary: string } | null {
  const jsonSlice = extractJsonObject(responseText)
  if (!jsonSlice) {
    return null
  }

  try {
    const parsed = JSON.parse(jsonSlice) as {
      jobQuality?: unknown
      redFlags?: unknown
      summary?: unknown
    }

    const jobQuality = clampToPercent(Number(parsed.jobQuality))
    const redFlags = clampToPercent(Number(parsed.redFlags))
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''

    return { jobQuality, redFlags, summary }
  } catch {
    return null
  }
}

function isFailedAuditText(auditText: string | undefined | null): boolean {
  if (typeof auditText !== 'string') {
    return false
  }

  const normalized = auditText.trim().toLowerCase()
  return normalized === 'searchaudit failed' || normalized.includes('searchaudit failed')
}

function getEmployerAuditKey(job: ScrapedJob): string {
  const employer = getOrCreateEmployer(job)
  return String(employer.name ?? '').trim().toLowerCase()
}

function computeFinalAuditScore(employer: ScrapedEmployer): number {
  if (employer.ai_score > 0 || employer.ai_red_flag_score > 0) {
    return clampToPercent((employer.ai_score + (100 - employer.ai_red_flag_score)) / 2)
  }
  return clampToPercent(employer.ai_score)
}

function hydrateJobAuditFromEmployer(job: ScrapedJob, employer: ScrapedEmployer): void {
  const finalAuditScore = computeFinalAuditScore(employer)
  job.audit_number = finalAuditScore
  job.audit_text = JSON.stringify({
    jobQuality: clampToPercent(employer.ai_score),
    redFlags: clampToPercent(employer.ai_red_flag_score),
    finalAuditScore,
    summary: employer.ai_summary,
  })
}

function clearFailedAudit(job: ScrapedJob): void {
  const employer = getOrCreateEmployer(job)
  employer.ai_score = 0
  employer.ai_red_flag_score = 0
  employer.ai_summary = ''
  employer.ai_red_flag_summary = ''
  scrapedEmployerCache.setCachedEmployer(employer)

  job.audit_number = 0
  job.audit_text = ''
}

function runWithLlmConcurrencyCap(runAudit: () => void): void {
  if (!ENABLE_TEMP_LLM_CONCURRENCY_CAP) {
    runAudit()
    return
  }

  const launch = () => {
    activeLlmAuditCalls += 1
    runAudit()
  }

  if (activeLlmAuditCalls < TEMP_MAX_SIMULTANEOUS_LLM_AUDITS) {
    launch()
    return
  }

  pendingLlmAuditQueue.push(launch)
}

function releaseLlmConcurrencySlot(): void {
  if (!ENABLE_TEMP_LLM_CONCURRENCY_CAP) {
    return
  }

  activeLlmAuditCalls = Math.max(0, activeLlmAuditCalls - 1)
  const next = pendingLlmAuditQueue.shift()
  if (next) {
    next()
  }
}

export function auditJob(job: ScrapedJob, shouldLog = false, shouldLaunch = false): number {
  const auditKey = getEmployerAuditKey(job)
  const employer = getOrCreateEmployer(job)

  shouldLog = shouldLog && !IS_PRODUCTION

  if (isFailedAuditText(job.audit_text) || isFailedAuditText(employer.ai_summary)) {
    if (shouldLog) {
      console.log(`[SearchAudit] Existing failure audit found for ${job.name}; deleting and retrying.`)
    }
    clearFailedAudit(job)
  }

  if (employer.ai_summary.trim().length > 0 || employer.ai_score > 0 || employer.ai_red_flag_score > 0) {
    if (shouldLog) {
      console.log(`[SearchAudit] Existing employer audit found for ${job.name}; skipping LLM audit.`)
    }
    hydrateJobAuditFromEmployer(job, employer)
    return clampToPercent(job.audit_number)
  }

  if (job.audit_number > 0 && job.audit_text.trim().length > 0) {
    const parsedLegacy = parseAuditRatings(job.audit_text)
    if (parsedLegacy) {
      employer.ai_score = parsedLegacy.jobQuality
      employer.ai_red_flag_score = parsedLegacy.redFlags
      employer.ai_summary = parsedLegacy.summary
      employer.ai_red_flag_summary = parsedLegacy.summary
      scrapedEmployerCache.setCachedEmployer(employer)
      hydrateJobAuditFromEmployer(job, employer)
      return clampToPercent(job.audit_number)
    }
  }

  if (inFlightAudits.has(auditKey)) {
    if (shouldLog) {
      console.log(`[SearchAudit] Audit already in flight for ${job.name}; skipping duplicate launch.`)
    }
    return clampToPercent(job.audit_number)
  }

  if (!shouldLaunch) {
    return clampToPercent(job.audit_number)
  }

  const question = [
    'Do some background research on this job posting and return ONLY valid JSON. Summarize the research you found on the company. Highlight any red flags about the company or the job posting.',
    '',
    'Rate both values from 0 to 100:',
    '- jobQuality: higher is better quality',
    '- redFlags: higher means more red flags',
    '',
    'JSON shape:',
    '{"summary": "string", "jobQuality": number, "redFlags": number}',
    '',
    '',
    "You are a job-seeker's due-diligence assistant. I am considering applying to the following role and need a thorough background check on the company before I invest time in the application.",
    '',
    '## Role Details',
    `- **Company:** ${job.company_name}`,
    `- **Title:** ${job.name}`,
    `- **Location:** ${job.location}`,
    `Job posting URL: ${job.source_url} (source: ${job.source})`,
    '',
    '## Job Description (for context)',
    `${job.description}`,
    '',
    '---',
    '',
    '## Research Tasks',
    '',
    'Please investigate the following and provide a structured report:',
    '',
    '1. **Company Overview**',
    '   - What does the company do? What industry and stage (startup, scale-up, public, non-profit, government, etc.)?',
    '   - Approximate headcount and founding year.',
    '',
    '2. **Financial Health & Stability**',
    '   - Is the company profitable or venture-funded? Recent funding rounds or revenue signals.',
    '   - Any signs of financial distress, layoffs, or downsizing in the past 12–18 months?',
    '',
    '3. **Reputation & Culture**',
    '   - Glassdoor / Blind / LinkedIn review sentiment. Common praise and complaints.',
    '   - Any notable leadership controversies, lawsuits, or press scandals?',
    '',
    '4. **Mission Alignment & Impact**',
    "   - Does the company's stated mission match its actions? Any greenwashing or impact-washing red flags?",
    '',
    '5. **Role Legitimacy**',
    '   - Does this job posting appear genuine? Any signals it could be a ghost listing, scam, or role already filled?',
    "   - Is the listed location consistent with the company's known offices?",
    '',
    '6. **Red Flags Summary**',
    '   - List any significant concerns I should investigate further before applying.',
    '',
    '7. **Overall Verdict**',
    '   - On a scale of Low / Medium / High, rate the risk of this company being a poor employer.',
    '   - Should I proceed with the application, proceed with caution, or skip?',
    '',
    'Be direct and honest. Do not soften negative findings.',
    '',
    'Do some background research on this job posting and return ONLY valid JSON. Summarize the research you found on the company. Highlight any red flags about the company or the job posting.',
    '',
    'Rate both values from 0 to 100:',
    '- jobQuality: higher is better quality',
    '- redFlags: higher means more red flags',
    '',
    'JSON shape:',
    '{"summary": "string", "jobQuality": number, "redFlags": number}',
  ].join('\n')

  if (!IS_PRODUCTION) {
    console.log(`[SearchAudit] Queuing Gemini audit for ${job.name} with question:\n${question}`)
  }

  inFlightAudits.add(auditKey)

  runWithLlmConcurrencyCap(() => {
    void (async () => {
      try {
        console.log(`[SearchAudit] Asking Gemini with search for ${job.name}`)
        const auditLabel = `gemini:audit ${String(job.company_name ?? '?')} | ${job.name}`
        setActiveOperation(auditLabel)
        const [result] = await askGeminiWithSearch([question], {
          systemInstruction:
            'You are a strict job-posting auditor. Keep output compact and produce JSON only.',
        })
        clearActiveOperation(auditLabel)

        const parsed = parseAuditRatings(result.answer)
        if (!parsed) {
          throw new Error(
            IS_PRODUCTION
              ? `SearchAudit failed to parse Gemini response for job: ${job.name}`
              : `SearchAudit failed to parse Gemini response for job: ${job.name} ${result.answer}`
          )
        }

        employer.ai_score = parsed.jobQuality
        employer.ai_red_flag_score = parsed.redFlags
        employer.ai_summary = parsed.summary
        employer.ai_red_flag_summary = parsed.summary
        scrapedEmployerCache.setCachedEmployer(employer)

        hydrateJobAuditFromEmployer(job, employer)
        fireAuditCallbacks(auditKey, { auditScore: job.audit_number, auditText: job.audit_text })

        if (shouldLog) {
          console.log(`[SearchAudit] Audit complete for ${job.name}`, {
            jobQuality: parsed.jobQuality,
            redFlags: parsed.redFlags,
            finalAuditScore: job.audit_number,
          })
        }
      } catch (error) {
        clearFailedAudit(job)
        fireAuditCallbacks(auditKey, {
          auditScore: 0,
          auditText: '',
          error: String(error),
        })
        if (shouldLog) {
          if (isQuotaError(error)) {
            const now = Date.now()
            if (now - lastQuotaWarnAt >= QUOTA_WARN_LOG_INTERVAL_MS) {
              lastQuotaWarnAt = now
              console.warn('[SearchAudit] Gemini rate/quota limit reached. Audits will retry more slowly.')
            }
          } else {
            console.error(`[SearchAudit] Audit failed for ${job.name}:`, error)
          }
        }
      } finally {
        inFlightAudits.delete(auditKey)
        releaseLlmConcurrencySlot()
      }
    })()
  })

  return clampToPercent(job.audit_number)
}

export function auditJobAsync(job: ScrapedJob, shouldLog = false): Promise<AuditResult> {
  const auditKey = getEmployerAuditKey(job)

  if (isFailedAuditText(job.audit_text) || isFailedAuditText(job.scrapedEmployer?.ai_summary)) {
    clearFailedAudit(job)
  }

  const employer = getOrCreateEmployer(job)
  if (employer.ai_summary.trim().length > 0 || employer.ai_score > 0 || employer.ai_red_flag_score > 0) {
    hydrateJobAuditFromEmployer(job, employer)
    return Promise.resolve({ auditScore: clampToPercent(job.audit_number), auditText: job.audit_text })
  }

  return new Promise((resolve) => {
    const existing = auditCompletionCallbacks.get(auditKey) ?? []
    existing.push(resolve)
    auditCompletionCallbacks.set(auditKey, existing)
    auditJob(job, shouldLog, true)
  })
}
