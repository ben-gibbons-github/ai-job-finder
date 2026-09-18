import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import type { JobScores, SearchLogFlags } from './SearchInterfaces.js'
import { getJobFreshnessScore } from './SearchFreshness.js'
import { calculateLocationScore } from './searchDistance/SearchDistance.js'
import { tokenize, calculateResumeScore } from './SearchResumeMatch.js'
import { getOrCreateEmployer } from '../scraping/core/ScrapedEmployerCache.js'
import { getEffectiveUnifiedCompanyAiScores } from './SearchCompanyAiUnified.js'

export interface QueryMatchTelemetry {
  calls: number
  haystackCacheHits: number
  haystackCacheMisses: number
  haystackBuildMs: number
  termChecks: number
  termCheckMs: number
  unknownTokenTerms: number
}

// Per-job haystack token sets — built once per job object lifetime, reused across searches.
// Uses integer token IDs (not strings) to minimize heap usage.
// A Set<number> of token IDs uses ~4 bytes/entry vs ~50+ bytes/entry for Set<string>.
const jobHaystackCache = new WeakMap<ScrapedJob, Set<number>>()

// Global vocabulary: maps normalized token string → stable integer ID.
// Only populated from haystack warmup/build, never shrinks.
const vocab = new Map<string, number>()

function internToken(token: string): number {
  let id = vocab.get(token)
  if (id === undefined) {
    id = vocab.size
    vocab.set(token, id)
  }
  return id
}

/** Return the vocab ID for a token, or -1 if it has never been seen. */
function lookupToken(token: string): number {
  return vocab.get(token) ?? -1
}

/** Returns the vocab size (number of unique tokens seen across all jobs). */
export function getVocabSize(): number {
  return vocab.size
}

// Caps applied to RAW strings BEFORE any toLowerCase / regex processing.
// This is critical: toSafeText().toLowerCase() on a 500 KB string takes seconds.
const HAYSTACK_FIELD_CAP = 800    // max raw chars from any single field
const HAYSTACK_TOTAL_CAP = 4000   // max raw chars fed to tokenize() in total

/** Slice a raw (un-lowercased) string before processing. */
function capRaw(value: unknown): string {
  const s = String(value ?? '')
  return s.length > HAYSTACK_FIELD_CAP ? s.slice(0, HAYSTACK_FIELD_CAP) : s
}

function getJobHaystackTokens(job: ScrapedJob, telemetry?: QueryMatchTelemetry): Set<number> {
  const cached = jobHaystackCache.get(job)
  if (cached !== undefined) {
    if (telemetry !== undefined) {
      telemetry.haystackCacheHits += 1
    }
    return cached
  }
  const buildStart = telemetry !== undefined ? performance.now() : 0
  // Cap each field BEFORE lowercasing/regex — avoids O(n) cost on huge descriptions.
  const raw = [
    capRaw(job.name),
    capRaw(job.company_name),
    capRaw(job.description),
    capRaw(job.source),
    job.tags.map((tag) => capRaw(tag)).join(' '),
  ].join(' ')
  // Final cap on the total to bound tokenize() input regardless of field count.
  const bounded = raw.length > HAYSTACK_TOTAL_CAP ? raw.slice(0, HAYSTACK_TOTAL_CAP) : raw
  const ids = new Set(tokenize(bounded).map(internToken))
  jobHaystackCache.set(job, ids)
  if (telemetry !== undefined) {
    telemetry.haystackCacheMisses += 1
    telemetry.haystackBuildMs += performance.now() - buildStart
  }
  return ids
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
 * Computes a company-quality score with job freshness: avg of (impact, qol, fresh, audit).
 * Used to pre-sort the master job list so strong-company matches surface first.
 */
export function getCompanyQualityScore(job: ScrapedJob): number {
  const employer = getOrCreateEmployer(job)
  const effectiveScores = getEffectiveUnifiedCompanyAiScores(employer)
  const impact = Math.min(effectiveScores.impactScore / 100, 1.0)
  const qol   = Math.min(effectiveScores.qualityOfLifeScore / 100, 1.0)
  const audit = Math.min(effectiveScores.auditScore / 100, 1.0)
  const fresh = getJobFreshnessScore(job)
  return (impact + qol + audit + fresh) / 4
}

/**
 * Sorts the jobs array in-place by descending company-quality score.
 * Call once after the master job list is loaded so all searches see the best jobs first.
 */
export function sortJobsByCompanyQuality(jobs: ScrapedJob[]): void {
  jobs.sort((a, b) => getCompanyQualityScore(b) - getCompanyQualityScore(a))
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
  const freshnessScore = getJobFreshnessScore(job)
  if (timingAcc !== undefined) timingAcc.freshnessMs += performance.now() - t

  // Get the employer related to this job:
  t = timingAcc !== undefined ? performance.now() : 0
  const employer = getOrCreateEmployer(job)
  const effectiveScores = getEffectiveUnifiedCompanyAiScores(employer)
  const auditScore = Math.min(effectiveScores.auditScore / 100, 1.0)
  if (timingAcc !== undefined) timingAcc.auditMs += performance.now() - t

  t = timingAcc !== undefined ? performance.now() : 0
  const qualityOfLifeScore = effectiveScores.qualityOfLifeScore
    ? Math.min(effectiveScores.qualityOfLifeScore / 100, 1.0)
    : 0
  if (timingAcc !== undefined) timingAcc.qolMs += performance.now() - t

  t = timingAcc !== undefined ? performance.now() : 0
  const impactScore = Math.min(effectiveScores.impactScore / 100, 1.0)
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
export function jobMatchesQuery(
  job: ScrapedJob,
  queryTerms: string[],
  shouldLog = false,
  telemetry?: QueryMatchTelemetry,
): boolean {
  if (queryTerms.length === 0) {
    return false
  }

  if (telemetry !== undefined) {
    telemetry.calls += 1
  }

  const haystackIds = getJobHaystackTokens(job, telemetry)
  const termCheckStart = telemetry !== undefined ? performance.now() : 0
  // queryTerms are pre-normalized/non-empty upstream; just resolve vocab IDs and test membership.
  const matches = queryTerms.every((term) => {
    if (telemetry !== undefined) {
      telemetry.termChecks += 1
    }
    const id = lookupToken(term)
    if (telemetry !== undefined && id === -1) {
      telemetry.unknownTokenTerms += 1
    }
    return id !== -1 && haystackIds.has(id)
  })
  if (telemetry !== undefined) {
    telemetry.termCheckMs += performance.now() - termCheckStart
  }
  if (shouldLog) {
    console.log('Query match check:', {
      jobName: job.name,
      queryTerms,
      matches,
    })
  }
  return matches
}
