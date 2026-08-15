import type { ScrapedJob } from '../scraping/ScrapedJob.js'

/**
 * Resume matching and text similarity functionality
 * Handles tokenization, normalization, and resume score calculation
 */

/**
 * Safely converts any value to lowercase text
 * Handles null, undefined, and non-string types
 * 
 * @param value - Any value to convert
 * @returns Lowercased string, or empty string if value is null/undefined
 */
export function toSafeText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).toLowerCase()
}

/**
 * Tokenizes text into meaningful tokens
 * Converts to lowercase, removes special characters, and filters short tokens
 * 
 * @param text - Text to tokenize
 * @returns Array of tokens with length >= 2
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

/**
 * Calculates overlap score between source tokens and target text
 * Uses a weighted combination of coverage and hit saturation metrics
 * 
 * Scoring logic:
 * - Coverage: percentage of source tokens found in target
 * - Hit saturation: balance between hits and noise (hits + 5)
 * - Final score: 35% coverage + 65% hit saturation (emphasizes quality over quantity)
 * 
 * @param sourceTokens - Tokens from the search/resume query
 * @param targetText - Text to search within (job description, etc)
 * @returns Score between 0 and 1
 */
export function overlapScore(sourceTokens: string[], targetText: string): number {
  if (sourceTokens.length === 0) {
    return 0
  }

  const uniqueSourceTokens = Array.from(new Set(sourceTokens))
  const targetTokens = new Set(tokenize(targetText))
  if (targetTokens.size === 0) {
    return 0
  }

  let hits = 0
  for (const token of uniqueSourceTokens) {
    if (targetTokens.has(token)) {
      hits += 1
    }
  }

  const coverage = hits / uniqueSourceTokens.length
  const hitSaturation = hits / (hits + 5)
  return Math.min(1, coverage * 0.35 + hitSaturation * 0.65) * 2
}

/**
 * Calculates the resume score for a job based on resume content matching
 * 
 * Combines resume text and creates a searchable target from job details,
 * then calculates overlap score
 * 
 * @param job - The job to score
 * @param resumeText - User's resume text
 * @returns Resume match score between 0 and 1
 */
// Per-job resume target token sets — built once per job object lifetime, reused across searches.
// Invalidated automatically if the job object is replaced (WeakMap semantics).
const jobTargetTokensCache = new WeakMap<ScrapedJob, Set<string>>()

function getJobTargetTokens(job: ScrapedJob): Set<string> {
  const cached = jobTargetTokensCache.get(job)
  if (cached !== undefined) {
    return cached
  }
  const resumeTarget = [
    toSafeText(job.name),
    toSafeText(job.company_name),
    toSafeText(job.description),
    toSafeText(job.type),
    toSafeText(job.scrapedEmployer?.name || ''),
    toSafeText(job.scrapedEmployer?.ai_impact_summary || ''),
    toSafeText(job.scrapedEmployer?.ai_summary || ''),
    toSafeText(job.scrapedEmployer?.ai_red_flag_summary || ''),
    toSafeText(job.scrapedEmployer?.employeeQualityOfLifeSummary || ''),
    job.tags.map((tag) => toSafeText(tag)).join(' '),
  ].join(' ')
  const tokens = new Set(tokenize(resumeTarget))
  jobTargetTokensCache.set(job, tokens)
  return tokens
}

// Resume score cache — populated on the first search with a given resume,
// then reused for all subsequent searches until the resume changes.
// Keyed on job.source_url so it survives pagination changes.
const resumeScoreCache: { fingerprint: string; scores: Map<string, number> } = {
  fingerprint: '',
  scores: new Map(),
}

/** ~2 pages — cap applied server-side as a safety net even if client already truncates */
const RESUME_MAX_CHARS = 6000

export function calculateResumeScore(job: ScrapedJob, resumeText: string, shouldLog = false, precomputedTokens?: string[]): number {
  // precomputedTokens should already be deduplicated by the caller (e.g. Array.from(new Set(...)))
  const cappedResume = resumeText.length > RESUME_MAX_CHARS ? resumeText.slice(0, RESUME_MAX_CHARS) : resumeText
  const sourceTokens = precomputedTokens ?? Array.from(new Set(tokenize(cappedResume)))
  if (sourceTokens.length === 0) {
    return 0
  }

  // Detect resume changes via a cheap fingerprint and clear the score cache when it differs.
  const fingerprint = `${sourceTokens.length}|${sourceTokens[0] ?? ''}|${sourceTokens[Math.floor(sourceTokens.length / 2)] ?? ''}|${sourceTokens[sourceTokens.length - 1] ?? ''}`
  if (fingerprint !== resumeScoreCache.fingerprint) {
    resumeScoreCache.fingerprint = fingerprint
    resumeScoreCache.scores.clear()
  }

  const jobKey = String(job.source_url ?? '')
  if (jobKey && resumeScoreCache.scores.has(jobKey)) {
    return resumeScoreCache.scores.get(jobKey)!
  }

  const targetTokens = getJobTargetTokens(job)
  if (targetTokens.size === 0) {
    if (jobKey) resumeScoreCache.scores.set(jobKey, 0)
    return 0
  }

  let hits = 0
  for (const token of sourceTokens) {
    if (targetTokens.has(token)) {
      hits += 1
    }
  }

  const coverage = hits / sourceTokens.length
  const hitSaturation = hits / (hits + 5)
  const raw = Math.min(1, coverage * 0.35 + hitSaturation * 0.65) * 2
  const score = Math.min(1, raw * 0.74)

  if (jobKey) {
    resumeScoreCache.scores.set(jobKey, score)
  }

  if (shouldLog) {
    console.log('Resume score calculated:', {
      jobName: job.name,
      resumeTokenCount: sourceTokens.length,
      score,
    })
  }
  return score
}
