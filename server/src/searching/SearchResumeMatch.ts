import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'

const RESUME_MATCH_BM25_ENABLED = String(process.env.RESUME_MATCH_BM25_ENABLED ?? '').toLowerCase() === 'true'
const JOB_NAME_WEIGHT = 10
const DEFAULT_FIELD_WEIGHT = 1
const BM25_K1 = 1.2
const BM25_B = 0.75
const BM25_AVG_DOC_LENGTH = 400
const RESUME_TARGET_FIELD_CAP = 6_000
const RESUME_TARGET_TOTAL_CAP = 24_000

function capTargetField(value: unknown): string {
  const text = toSafeText(value)
  return text.length > RESUME_TARGET_FIELD_CAP ? text.slice(0, RESUME_TARGET_FIELD_CAP) : text
}

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
interface TokenStats {
  tokenSet: Set<string>
  tokenFreqs: Map<string, number>
  weightedTokenFreqs: Map<string, number>
  docLength: number
  weightedDocLength: number
}

interface JobTargetStats {
  job: TokenStats
  employer: TokenStats
  titleTokenSet: Set<string>
}

// Job-specific stats remain per job; employer descriptions and AI summaries are shared by name.
const jobTargetStatsCache = new WeakMap<ScrapedJob, JobTargetStats>()
const employerTargetStatsCache = new Map<string, TokenStats>()

function createTokenStats(fields: Array<{ text: string; weight: number }>): TokenStats {
  const tokenSet = new Set<string>()
  const tokenFreqs = new Map<string, number>()
  const weightedTokenFreqs = new Map<string, number>()
  let weightedDocLength = 0
  let processedChars = 0

  for (const field of fields) {
    if (processedChars >= RESUME_TARGET_TOTAL_CAP) break
    const remainingChars = RESUME_TARGET_TOTAL_CAP - processedChars
    const tokens = tokenize(field.text.slice(0, remainingChars))
    processedChars += Math.min(field.text.length, remainingChars)
    for (const token of tokens) {
      tokenSet.add(token)
      tokenFreqs.set(token, (tokenFreqs.get(token) ?? 0) + 1)
      weightedTokenFreqs.set(token, (weightedTokenFreqs.get(token) ?? 0) + field.weight)
      weightedDocLength += field.weight
    }
  }

  return {
    tokenSet,
    tokenFreqs,
    weightedTokenFreqs,
    docLength: tokenSet.size === 0 ? 0 : Array.from(tokenSet).reduce((sum, token) => sum + (tokenFreqs.get(token) ?? 0), 0),
    weightedDocLength,
  }
}

function normalizeEmployerKey(name: unknown): string {
  return String(name ?? '').trim().toLowerCase()
}

function getEmployerTargetStats(job: ScrapedJob): TokenStats {
  const employer = job.scrapedEmployer
  const key = normalizeEmployerKey(employer?.name || job.company_name)
  if (!key) {
    return createTokenStats([])
  }

  const cached = employerTargetStatsCache.get(key)
  if (cached !== undefined) return cached

  const stats = createTokenStats([
    { text: capTargetField(employer?.name || job.company_name), weight: DEFAULT_FIELD_WEIGHT },
    { text: capTargetField(employer?.ai_impact_summary || ''), weight: DEFAULT_FIELD_WEIGHT },
    { text: capTargetField(employer?.ai_summary || ''), weight: DEFAULT_FIELD_WEIGHT },
    { text: capTargetField(employer?.ai_red_flag_summary || ''), weight: DEFAULT_FIELD_WEIGHT },
    { text: capTargetField(employer?.employeeQualityOfLifeSummary || ''), weight: DEFAULT_FIELD_WEIGHT },
  ])
  employerTargetStatsCache.set(key, stats)
  return stats
}

function getJobTargetStats(job: ScrapedJob): JobTargetStats {
  const cached = jobTargetStatsCache.get(job)
  if (cached !== undefined) {
    return cached
  }

  const jobStats = createTokenStats([
    { text: capTargetField(job.name), weight: JOB_NAME_WEIGHT },
    { text: capTargetField(job.description), weight: DEFAULT_FIELD_WEIGHT },
    { text: capTargetField(job.type), weight: DEFAULT_FIELD_WEIGHT },
  ])
  const stats: JobTargetStats = {
    job: jobStats,
    employer: getEmployerTargetStats(job),
    titleTokenSet: new Set(tokenize(toSafeText(job.name))),
  }

  jobTargetStatsCache.set(job, stats)
  return stats
}

export function warmJobResumeTargetStats(job: ScrapedJob): void {
  getJobTargetStats(job)
}

export function warmResumeTargetStatsCache(jobs: ScrapedJob[]): void {
  for (const job of jobs) {
    warmJobResumeTargetStats(job)
  }
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

function calculateTitlePenaltyMultiplier(sourceTokens: string[], targetStats: JobTargetStats): number {
  const sourceSet = new Set(sourceTokens)
  let titleMissPenalty = 0
  for (const token of targetStats.titleTokenSet) {
    if (!sourceSet.has(token)) {
      titleMissPenalty += JOB_NAME_WEIGHT
    }
  }

  if (targetStats.titleTokenSet.size === 0) {
    return 1
  }

  const maxPenalty = targetStats.titleTokenSet.size * JOB_NAME_WEIGHT
  return Math.max(0, 1 - titleMissPenalty / maxPenalty)
}

function calculateOverlapResumeScore(sourceTokens: string[], targetStats: JobTargetStats): number {
  const sourceSet = new Set(sourceTokens)
  let weightedHits = 0
  for (const token of sourceTokens) {
    if (!targetStats.job.tokenSet.has(token) && !targetStats.employer.tokenSet.has(token)) {
      continue
    }
    weightedHits += targetStats.titleTokenSet.has(token) ? JOB_NAME_WEIGHT : DEFAULT_FIELD_WEIGHT
  }

  const titlePenaltyMultiplier = calculateTitlePenaltyMultiplier(sourceTokens, targetStats)
  const coverage = weightedHits / Math.max(1, weightedHits + (targetStats.titleTokenSet.size * JOB_NAME_WEIGHT))
  const hitSaturation = weightedHits / (weightedHits + 5)
  const raw = Math.min(1, coverage * 0.35 + hitSaturation * 0.65) * 2
  return Math.min(1, raw * 0.74 * titlePenaltyMultiplier)
}

function calculateBm25ResumeScore(sourceTokens: string[], targetStats: JobTargetStats): number {
  const docLength = targetStats.job.docLength + targetStats.employer.docLength
  const docLengthNorm = 1 - BM25_B + BM25_B * (docLength / BM25_AVG_DOC_LENGTH)
  const titlePenaltyMultiplier = calculateTitlePenaltyMultiplier(sourceTokens, targetStats)
  let matchedTerms = 0
  let bm25Sum = 0

  for (const token of sourceTokens) {
    const termFrequency =
      (targetStats.job.weightedTokenFreqs.get(token) ?? 0)
      + (targetStats.employer.weightedTokenFreqs.get(token) ?? 0)
    if (termFrequency <= 0) {
      continue
    }

    matchedTerms += 1
    const tokenWeight = targetStats.titleTokenSet.has(token) ? JOB_NAME_WEIGHT : DEFAULT_FIELD_WEIGHT
    const adjustedFrequency = termFrequency * tokenWeight
    bm25Sum += (adjustedFrequency * (BM25_K1 + 1)) / (adjustedFrequency + BM25_K1 * docLengthNorm)
  }

  if (matchedTerms === 0) {
    return 0
  }

  const coverage = matchedTerms / sourceTokens.length
  const normalizedBm25 = Math.min(1, bm25Sum / (sourceTokens.length * (BM25_K1 + 1)))
  return Math.min(1, (coverage * 0.45 + normalizedBm25 * 0.55) * 1.35 * titlePenaltyMultiplier)
}

export function calculateResumeScore(job: ScrapedJob, resumeText: string, shouldLog = false, precomputedTokens?: string[]): number {
  // precomputedTokens should already be deduplicated by the caller (e.g. Array.from(new Set(...)))
  const cappedResume = resumeText.length > RESUME_MAX_CHARS ? resumeText.slice(0, RESUME_MAX_CHARS) : resumeText
  const sourceTokens = precomputedTokens ?? Array.from(new Set(tokenize(cappedResume)))
  if (sourceTokens.length === 0) {
    return 0
  }

  const scorerKey = RESUME_MATCH_BM25_ENABLED ? 'bm25' : 'overlap'
  // Detect resume changes via a cheap fingerprint and clear the score cache when it differs.
  const fingerprint = `${scorerKey}|${sourceTokens.length}|${sourceTokens[0] ?? ''}|${sourceTokens[Math.floor(sourceTokens.length / 2)] ?? ''}|${sourceTokens[sourceTokens.length - 1] ?? ''}`
  if (fingerprint !== resumeScoreCache.fingerprint) {
    resumeScoreCache.fingerprint = fingerprint
    resumeScoreCache.scores.clear()
  }

  const jobKey = String(job.source_url ?? '')
  if (jobKey && resumeScoreCache.scores.has(jobKey)) {
    return resumeScoreCache.scores.get(jobKey)!
  }

  const targetStats = getJobTargetStats(job)
  if (targetStats.job.tokenSet.size === 0 && targetStats.employer.tokenSet.size === 0) {
    if (jobKey) resumeScoreCache.scores.set(jobKey, 0)
    return 0
  }

  const score = RESUME_MATCH_BM25_ENABLED
    ? calculateBm25ResumeScore(sourceTokens, targetStats)
    : calculateOverlapResumeScore(sourceTokens, targetStats)

  if (jobKey) {
    resumeScoreCache.scores.set(jobKey, score)
  }

  if (shouldLog) {
    console.log('Resume score calculated:', {
      jobName: job.name,
      algorithm: scorerKey,
      resumeTokenCount: sourceTokens.length,
      score,
    })
  }
  return score
}
