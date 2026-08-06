import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import type { JobScores, SearchLogFlags } from './SearchInterfaces.js'
import { calculateFreshnessScore } from './SearchFreshness.js'
import { calculateLocationScore } from './SearchDistance.js'
import { calculateImpactScore } from './SearchImpact.js'
import { toSafeText, tokenize, calculateResumeScore } from './SearchResumeMatch.js'
import { getOrCreateEmployer } from '../scraping/ScrapedEmployerCache.js'

// Per-job haystack token sets — built once per job object lifetime, reused across searches.
// Using a Set<string> of tokens gives O(1) per-term lookup vs O(haystack_length) string.includes().
const jobHaystackCache = new WeakMap<ScrapedJob, Set<string>>()

function getJobHaystackTokens(job: ScrapedJob): Set<string> {
  const cached = jobHaystackCache.get(job)
  if (cached !== undefined) {
    return cached
  }
  const raw = [
    toSafeText(job.name),
    toSafeText(job.company_name),
    toSafeText(job.location),
    toSafeText(job.description),
    toSafeText(job.type),
    toSafeText(job.source),
    toSafeText(job.source_url),
    toSafeText(job.posted),
    job.tags.map((tag) => toSafeText(tag)).join(' '),
  ].join(' ')
  const tokens = new Set(tokenize(raw))
  jobHaystackCache.set(job, tokens)
  return tokens
}

/**
 * Pre-warms the job haystack token cache for all jobs in the provided array.
 * Call this at startup so the first user search doesn't pay the build cost.
 */
export function warmJobHaystachCache(jobs: ScrapedJob[]): void {
  for (const job of jobs) {
    getJobHaystackTokens(job)
  }
}

/**
 * Calculate individual score components for a job
 * 
 * @param job - The job to score
 * @param resumeText - User's resume text
 * @param locationText - User's location text
 * @param userLat - User's latitude (or null if not available)
 * @param userLon - User's longitude (or null if not available)
 * @returns JobScores object with resume, impact, location, freshness, and audit scores
 */
export interface ScoreTimings {
  resumeMs: number
  locationMs: number
  freshnessMs: number
  auditMs: number
  qolMs: number
  impactMs: number
}

export function calculateIndividualScores(
  job: ScrapedJob,
  resumeText: string,
  locationText: string,
  userLat: number | null,
  userLon: number | null,
  logFlags: SearchLogFlags = {},
  precomputedResumeTokens?: string[],
  timingAcc?: ScoreTimings
): JobScores {

  let t = 0

  // Resume score
  t = timingAcc !== undefined ? performance.now() : 0
  const resumeScore = calculateResumeScore(job, resumeText, logFlags.resume === true, precomputedResumeTokens)
  if (timingAcc !== undefined) timingAcc.resumeMs += performance.now() - t

  // Location score (based on distance and remote status)
  t = timingAcc !== undefined ? performance.now() : 0
  const locationScore = calculateLocationScore(userLat, userLon, job, locationText, logFlags.location === true)
  if (timingAcc !== undefined) timingAcc.locationMs += performance.now() - t

  // Freshness score
  t = timingAcc !== undefined ? performance.now() : 0
  const freshnessScore = calculateFreshnessScore(job.posted, logFlags.fresh === true)
  if (timingAcc !== undefined) timingAcc.freshnessMs += performance.now() - t

  // Get the employer related to this job:
  t = timingAcc !== undefined ? performance.now() : 0
  const employer = getOrCreateEmployer(job)
  const auditScore = Math.min(employer.ai_score / 100, 1.0)
  if (timingAcc !== undefined) timingAcc.auditMs += performance.now() - t

  t = timingAcc !== undefined ? performance.now() : 0
  const qualityOfLifeScore = employer.employeeQualityOfLifeScore ? Math.min(employer.employeeQualityOfLifeScore / 100, 1.0) : 0
  if (timingAcc !== undefined) timingAcc.qolMs += performance.now() - t

  t = timingAcc !== undefined ? performance.now() : 0
  const impactScore = Math.min(employer.ai_impact_score / 100, 1.0)
  if (timingAcc !== undefined) timingAcc.impactMs += performance.now() - t

  if (logFlags.audit === true || logFlags.searchMain === true) {
    console.log('Calculated scores for job:', {
      name: job.name,
      company: job.company_name,
      resumeScore,
      impactScore,
      locationScore,
      freshnessScore,
      auditScore,
      qualityOfLifeScore,
    })
  }

  return {
    resume: resumeScore,
    impact: impactScore,
    location: locationScore,
    fresh: freshnessScore,
    audit: auditScore,
    qualityOfLife: qualityOfLifeScore,
  }
}

/**
 * Check if a job matches all query terms
 * 
 * Searches across job name, company, location, description, type, source, URL,
 * posting date, AI summary, red flags, and tags
 * 
 * @param job - The job to check
 * @param queryTerms - Array of search terms (already lowercased)
 * @returns true if job matches all query terms
 */
export function jobMatchesQuery(job: ScrapedJob, queryTerms: string[], shouldLog = false): boolean {
  if (queryTerms.length === 0) {
    return false
  }

  const haystackTokens = getJobHaystackTokens(job)
  // Normalize each query term the same way the tokenizer does (lowercase, strip special chars)
  // so that multi-word and punctuated queries resolve correctly.
  const matches = queryTerms.every((term) => {
    const normalized = term.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalized.length === 0) return true // ignore empty terms after normalization
    return haystackTokens.has(normalized)
  })
  if (shouldLog) {
    console.log('Query match check:', {
      jobName: job.name,
      queryTerms,
      matches,
    })
  }
  return matches
}
