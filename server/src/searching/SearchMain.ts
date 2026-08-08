

import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import type {
  ScoreWeights,
  SearchPayload,
  SearchLogFlags,
  UserRatingMode,
  JobScores,
  JobAiPayload,
  SearchAiCoverage,
  SearchResultMeta,
  SearchScoreBucket,
  SearchDebugInfo,
  RankedJobWrapper,
} from './SearchInterfaces.js'
import { auditJob } from './SearchAudit.js'
import { geocodeUserLocation, geocodeJobLocations, isRemoteJob } from './SearchDistance.js'
import { calculateIndividualScores, jobMatchesQuery, type ScoreTimings } from './SearchUtils.js'
import { tokenize } from './SearchResumeMatch.js'
import { setActiveOperation, clearActiveOperation } from '../utils/ServerActivityTracker.js'

const SERVER_HIDDEN_EXCLUSIONS_ENABLED = true

/** Yield to the event loop between large sync operations. */
const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve))

/**
 * Non-blocking filter: processes `arr` in chunks, yielding between each so
 * the event loop stays responsive. Each chunk takes <chunkMs ms to process.
 */
async function asyncFilter<T>(arr: T[], predicate: (item: T) => boolean, chunkSize = 50_000): Promise<T[]> {
  const result: T[] = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, arr.length)
    for (let j = i; j < end; j++) {
      if (predicate(arr[j])) result.push(arr[j])
    }
    if (end < arr.length) await yieldToEventLoop()
  }
  return result
}

/**
 * Non-blocking map: processes `arr` in chunks, yielding between each.
 */
async function asyncMap<T, U>(arr: T[], fn: (item: T) => U, chunkSize = 2_000): Promise<U[]> {
  const result: U[] = new Array(arr.length)
  for (let i = 0; i < arr.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, arr.length)
    for (let j = i; j < end; j++) {
      result[j] = fn(arr[j])
    }
    if (end < arr.length) await yieldToEventLoop()
  }
  return result
}

// ─── Search result cache ─────────────────────────────────────────────────────
// Caches full sorted result sets (pre-pagination) keyed on a fingerprint of all
// search settings EXCEPT start/end. Pagination then slices from the cached list.

const SEARCH_CACHE_MAX_ENTRIES = 10

interface CachedSearch {
  wrappers: RankedJobWrapper[]
  size: number
  /** Meta without debugInfo — timing data is per-search and shouldn't be cached */
  meta: Omit<SearchResultMeta, 'debugInfo'>
}

function buildSearchFingerprint(payload: SearchPayload): string {
  // Fingerprint resumeText cheaply — the full text can be tens of thousands of chars
  const resumeText = typeof payload.resumeText === 'string' ? payload.resumeText : ''
  const resumeFingerprint = `${resumeText.length}|${resumeText.slice(0, 64)}|${resumeText.slice(-64)}`

  return JSON.stringify({
    q: String(payload.query ?? '').trim().toLowerCase(),
    resume: resumeFingerprint,
    loc: String(payload.locationText ?? ''),
    remote: payload.includeRemoteJobs !== false,
    ratingMode: payload.userRatingMode ?? 'none',
    weights: payload.scoreWeights ?? null,
    hiddenUrls: [...(payload.hiddenJobUrls ?? [])].sort(),
    hiddenCo: [...(payload.hiddenCompanies ?? [])].sort(),
    ratings: payload.userRatings ?? null,
    ratingFilter: payload.userRatingFilter ?? null,
    addedJobs: [...(payload.addedJobs ?? [])]
      .sort((a, b) => String(a.source_url ?? '').localeCompare(String(b.source_url ?? '')))
      .map((j) => ({ url: j.source_url, score: j.userScore })),
  })
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function normalizeExactUrl(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeExactCompanyName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function parseUserRatingMode(value: unknown): UserRatingMode {
  if (value === 'none' || value === 'sort' || value === 'ratedOnly' || value === 'hideRated') {
    return value
  }
  return 'none'
}

function normalizeUserScore(value: unknown): number | null {
  const score = Number(value)
  if (!Number.isFinite(score)) {
    return null
  }
  return Math.max(0, Math.min(100, score))
}

function buildUserRatingMap(raw: unknown, normalizeKey: (value: unknown) => string): Map<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return new Map<string, number>()
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => {
      const normalizedKey = normalizeKey(key)
      const normalizedScore = normalizeUserScore(value)
      return [normalizedKey, normalizedScore] as const
    })
    .filter(([key, score]) => key.length > 0 && score !== null)

  return new Map(entries as Array<[string, number]>)
}

function getRatedCompanyKeys(job: ScrapedJob): string[] {
  const keys = [
    normalizeExactCompanyName(job.company_name),
    normalizeExactCompanyName(job.scrapedEmployer?.name),
  ].filter((value) => value.length > 0)

  return Array.from(new Set(keys))
}

function getEffectiveUserRating(job: ScrapedJob, jobRatingMap: Map<string, number>, companyRatingMap: Map<string, number>): number | null {
  const sourceUrl = normalizeExactUrl(job.source_url)
  if (sourceUrl.length > 0) {
    const jobRating = jobRatingMap.get(sourceUrl)
    if (typeof jobRating === 'number') {
      return jobRating
    }
  }

  const companyKeys = getRatedCompanyKeys(job)
  for (const companyKey of companyKeys) {
    const companyRating = companyRatingMap.get(companyKey)
    if (typeof companyRating === 'number') {
      return companyRating
    }
  }

  return null
}

function hasAnyUserRating(job: ScrapedJob, ratedJobUrls: Set<string>, ratedCompanies: Set<string>): boolean {
  const sourceUrl = normalizeExactUrl(job.source_url)
  if (sourceUrl.length > 0 && ratedJobUrls.has(sourceUrl)) {
    return true
  }

  const companyKeys = getRatedCompanyKeys(job)
  return companyKeys.some((companyKey) => ratedCompanies.has(companyKey))
}

function sanitizeAddedJobs(raw: unknown): ScrapedJob[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return []
  }

  const jobs: ScrapedJob[] = []
  const nowIso = new Date().toISOString()

  for (let index = 0; index < raw.length; index += 1) {
    const row = raw[index]
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }

    const obj = row as Record<string, unknown>
    const name = String(obj.name ?? '').trim()
    const companyName = String(obj.company_name ?? '').trim()
    if (!name || !companyName) {
      continue
    }

    const sourceUrlRaw = String(obj.source_url ?? '').trim()
    const sourceUrl = sourceUrlRaw || `local://added-job/${Date.now()}-${index}`
    const userScore = normalizeUserScore(obj.userScore)
    const ratingBoost = typeof userScore === 'number' ? Math.max(0.45, userScore / 100) : 0.25

    jobs.push({
      name,
      company_name: companyName,
      location: String(obj.location ?? 'Unknown').trim() || 'Unknown',
      remote: String(obj.remote ?? 'Unknown').trim() || 'Unknown',
      location_lon: 0,
      location_lat: 0,
      description: String(obj.description ?? '').trim(),
      type: String(obj.type ?? 'Unknown').trim() || 'Unknown',
      source: 'AddedByUser',
      source_url: sourceUrl,
      posted: String(obj.posted ?? '').trim() || nowIso,
      impact_number: 0,
      audit_number: Math.round(ratingBoost * 100),
      audit_text: '',
      tags: ['User Added'],
    })
  }

  return jobs
}

function mergeAddedJobs(baseJobs: ScrapedJob[], addedJobs: ScrapedJob[]): ScrapedJob[] {
  if (addedJobs.length === 0) {
    return baseJobs
  }

  const dedup = new Map<string, ScrapedJob>()
  for (const job of addedJobs) {
    const sourceUrl = normalizeExactUrl(job.source_url)
    if (!sourceUrl) {
      continue
    }
    dedup.set(sourceUrl, job)
  }

  for (const job of baseJobs) {
    const sourceUrl = normalizeExactUrl(job.source_url)
    if (!sourceUrl || dedup.has(sourceUrl)) {
      continue
    }
    dedup.set(sourceUrl, job)
  }

  return Array.from(dedup.values())
}

function buildJobAiPayload(job: ScrapedJob): JobAiPayload | undefined {
  const employer = job.scrapedEmployer
  if (!employer) {
    return undefined
  }

  const auditSummary = String(employer.ai_summary ?? '').trim()
  const auditRedFlagSummary = String(employer.ai_red_flag_summary ?? '').trim()
  const impactSummary = String(employer.ai_impact_summary ?? '').trim()
  const qualityOfLifeSummary = String(employer.employeeQualityOfLifeSummary ?? '').trim()

  const auditScore = Number(employer.ai_score ?? 0)
  const redFlagScore = Number(employer.ai_red_flag_score ?? 0)
  const impactScore = Number(employer.ai_impact_score ?? 0)
  const qualityOfLifeScore = Number(employer.employeeQualityOfLifeScore ?? 0)

  return {
    audit: {
      hasData:
        auditSummary.length > 0 ||
        auditRedFlagSummary.length > 0 ||
        Number.isFinite(auditScore) && auditScore > 0 ||
        Number.isFinite(redFlagScore) && redFlagScore > 0,
      score: Number.isFinite(auditScore) ? auditScore : 0,
      redFlagScore: Number.isFinite(redFlagScore) ? redFlagScore : 0,
      summary: auditSummary,
      redFlagSummary: auditRedFlagSummary,
    },
    impact: {
      hasData: impactSummary.length > 0 || (Number.isFinite(impactScore) && impactScore > 0),
      score: Number.isFinite(impactScore) ? impactScore : 0,
      summary: impactSummary,
    },
    qualityOfLife: {
      hasData: qualityOfLifeSummary.length > 0 || (Number.isFinite(qualityOfLifeScore) && qualityOfLifeScore > 0),
      score: Number.isFinite(qualityOfLifeScore) ? qualityOfLifeScore : 0,
      summary: qualityOfLifeSummary,
    },
  }
}

function toPercent(part: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Number(((part / total) * 100).toFixed(1))
}

function buildSearchAiCoverage(wrappers: RankedJobWrapper[]): SearchAiCoverage {
  const totalMatched = wrappers.length
  const auditCount = wrappers.filter((wrapper) => wrapper.aiPayload?.audit?.hasData === true).length
  const impactCount = wrappers.filter((wrapper) => wrapper.aiPayload?.impact?.hasData === true).length
  const qualityOfLifeCount = wrappers.filter((wrapper) => wrapper.aiPayload?.qualityOfLife?.hasData === true).length
  const geocodedCount = wrappers.filter((wrapper) => {
    const lat = Number(wrapper.job.location_lat)
    const lon = Number(wrapper.job.location_lon)
    return Number.isFinite(lat) && Number.isFinite(lon)
  }).length

  return {
    auditPercent: toPercent(auditCount, totalMatched),
    impactPercent: toPercent(impactCount, totalMatched),
    qualityOfLifePercent: toPercent(qualityOfLifeCount, totalMatched),
    geocodedPercent: toPercent(geocodedCount, totalMatched),
    totalMatched,
  }
}

function buildScoreDistribution(wrappers: RankedJobWrapper[]): SearchScoreBucket[] {
  const buckets = new Map<number, number>()

  for (const wrapper of wrappers) {
    const scorePercent = Number(wrapper.totalScore ?? 0) * 100
    if (!Number.isFinite(scorePercent)) {
      continue
    }
    const bucketStart = Math.max(0, Math.floor(scorePercent / 10) * 10)
    buckets.set(bucketStart, (buckets.get(bucketStart) ?? 0) + 1)
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([start, count]) => ({
      start,
      end: start + 9,
      count,
    }))
}

class SearchMain {
  // LRU cache: Map preserves insertion order; on access we delete+re-insert to move to end
  private readonly searchCache = new Map<string, CachedSearch>()

  private getCached(fingerprint: string): CachedSearch | undefined {
    const entry = this.searchCache.get(fingerprint)
    if (entry !== undefined) {
      // Move to end (most-recently-used)
      this.searchCache.delete(fingerprint)
      this.searchCache.set(fingerprint, entry)
    }
    return entry
  }

  private setCached(fingerprint: string, result: CachedSearch): void {
    if (this.searchCache.has(fingerprint)) {
      this.searchCache.delete(fingerprint)
    } else if (this.searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
      // Evict least-recently-used (first key in insertion-ordered Map)
      const lruKey = this.searchCache.keys().next().value
      if (lruKey !== undefined) {
        this.searchCache.delete(lruKey)
      }
    }
    this.searchCache.set(fingerprint, result)
  }

  async search(jobs: ScrapedJob[], searchPayload: SearchPayload, debugEnabled = false): Promise<{ matched: RankedJobWrapper[]; size: number; meta: SearchResultMeta }> {
    const searchStart = performance.now()
    const logFlags: SearchLogFlags = searchPayload.searchLogFlags ?? {}
    const logSearchMain = logFlags.searchMain === true
    const hiddenExclusionsEnabled = SERVER_HIDDEN_EXCLUSIONS_ENABLED

    const rawQueryValue = searchPayload.query
    const rawQuery = typeof rawQueryValue === 'string' ? rawQueryValue : ''
    const queryTerms = rawQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 0)

    // ─── Cache lookup ────────────────────────────────────────────────────────
    // Audit commands have side effects and are never cached.
    const isAuditCommand = searchPayload.command != null
    const searchFingerprint = isAuditCommand ? null : buildSearchFingerprint(searchPayload)

    if (searchFingerprint !== null) {
      const cached = this.getCached(searchFingerprint)
      if (cached !== undefined) {
        const hitMs = Number((performance.now() - searchStart).toFixed(2))
        const start = Number.isInteger(searchPayload.start) ? Number(searchPayload.start) : 0
        const end = Number.isInteger(searchPayload.end) ? Number(searchPayload.end) : cached.size
        const sliced = (start < 0 || end < 0 || end <= start)
          ? cached.wrappers
          : cached.wrappers.slice(start, end)
        const zeroTimings: SearchDebugInfo['timings'] = {
          filterMs: 0, queryMatchMs: 0, userGeocodeMs: 0,
          jobGeocodeMs: 0, jobGeoHadCoords: 0, jobGeoNewlyGeocoded: 0, jobGeoSkipped: cached.size,
          scoreTotalMs: 0, scoreResumeMs: 0, scoreLocationMs: 0, scoreFreshnessMs: 0,
          scoreAuditMs: 0, scoreQolMs: 0, scoreImpactMs: 0, scoreSortMs: 0,
          userRatingSortMs: 0, totalMs: hitMs,
        }
        const meta: SearchResultMeta = {
          ...cached.meta,
          debugInfo: debugEnabled ? {
            cacheHit: true,
            userLat: null, userLon: null,
            locationText: String(searchPayload.locationText ?? ''),
            query: rawQuery,
            totalJobsInput: 0, totalJobsVisible: 0, totalJobsMatched: cached.size,
            timings: zeroTimings,
            exclusions: {
              hiddenByUrl: 0, hiddenByCompany: 0, remoteJobsFiltered: 0,
              userRatingFiltered: 0,
              userRatingFilterMode: String(searchPayload.userRatingMode ?? 'none'),
              queryMismatch: 0,
            },
          } : undefined,
        }
        console.log(`[SearchMain] cache hit (${hitMs}ms) query="${rawQuery}" returning ${sliced.length}/${cached.size}`)
        return { matched: sliced, size: cached.size, meta }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const hiddenJobUrls = hiddenExclusionsEnabled && Array.isArray(searchPayload.hiddenJobUrls)
      ? new Set(
          searchPayload.hiddenJobUrls
            .map((value: unknown) => normalizeExactUrl(value))
            .filter((value: string) => value.length > 0),
        )
      : new Set<string>()
    const hiddenCompanies = hiddenExclusionsEnabled && Array.isArray(searchPayload.hiddenCompanies)
      ? new Set(
          searchPayload.hiddenCompanies
            .map((value: unknown) => normalizeExactCompanyName(value))
            .filter((value: string) => value.length > 0),
        )
      : new Set<string>()

    const addedJobs = sanitizeAddedJobs(searchPayload.addedJobs)
    const jobsForSearch = mergeAddedJobs(jobs, addedJobs)

    const filterStart = performance.now()
    setActiveOperation(`search:filter (${jobs.length} jobs, query="${rawQuery}")`)
    const visibleJobs = await asyncFilter(jobsForSearch, (job) => {
      const sourceUrl = normalizeExactUrl(job.source_url)
      const companyName = normalizeExactCompanyName(job.company_name)
      if (sourceUrl && hiddenJobUrls.has(sourceUrl)) {
        return false
      }
      if (companyName && hiddenCompanies.has(companyName)) {
        return false
      }
      return true
    })

    const includeRemoteJobs = searchPayload.includeRemoteJobs !== false
    const remoteFilteredJobs = includeRemoteJobs
      ? visibleJobs
      : await asyncFilter(visibleJobs, (job) => !isRemoteJob(job))

    const userRatingMode = parseUserRatingMode(searchPayload.userRatingMode)
    const jobRatingMap = userRatingMode !== 'none'
      ? buildUserRatingMap(searchPayload.userRatings?.jobRatingsByUrl, normalizeExactUrl)
      : new Map<string, number>()
    const companyRatingMap = userRatingMode !== 'none'
      ? buildUserRatingMap(searchPayload.userRatings?.companyRatingsByName, normalizeExactCompanyName)
      : new Map<string, number>()
    const ratedJobUrls = userRatingMode === 'ratedOnly' || userRatingMode === 'hideRated'
      ? new Set([
          ...Array.from(jobRatingMap.keys()),
          ...(Array.isArray(searchPayload.userRatingFilter?.ratedJobUrls)
            ? searchPayload.userRatingFilter.ratedJobUrls
                .map((value: unknown) => normalizeExactUrl(value))
                .filter((value: string) => value.length > 0)
            : []),
        ])
      : new Set<string>()
    const ratedCompanies = userRatingMode === 'ratedOnly' || userRatingMode === 'hideRated'
      ? new Set([
          ...Array.from(companyRatingMap.keys()),
          ...(Array.isArray(searchPayload.userRatingFilter?.ratedCompanies)
            ? searchPayload.userRatingFilter.ratedCompanies
                .map((value: unknown) => normalizeExactCompanyName(value))
                .filter((value: string) => value.length > 0)
            : []),
        ])
      : new Set<string>()
    const ratingFilteredJobs = userRatingMode === 'ratedOnly'
      ? await asyncFilter(remoteFilteredJobs, (job) => hasAnyUserRating(job, ratedJobUrls, ratedCompanies))
      : userRatingMode === 'hideRated'
        ? await asyncFilter(remoteFilteredJobs, (job) => !hasAnyUserRating(job, ratedJobUrls, ratedCompanies))
        : remoteFilteredJobs
    const filterMs = performance.now() - filterStart
    clearActiveOperation('search:filter')

    if (logSearchMain) {
      console.log(
        'SearchMain.search called with query:',
        rawQuery,
        'parsed terms:',
        queryTerms,
        'locationText:',
        searchPayload.locationText,
        'resumeText length:',
        typeof searchPayload.resumeText === 'string' ? searchPayload.resumeText.length : 'N/A',
        'hiddenExclusionsEnabled:',
        hiddenExclusionsEnabled,
        'hiddenJobUrls:',
        hiddenJobUrls.size,
        'hiddenCompanies:',
        hiddenCompanies.size,
        'userRatingMode:',
        userRatingMode,
        'jobRatingMap:',
        jobRatingMap.size,
        'companyRatingMap:',
        companyRatingMap.size,
        'ratedJobUrls:',
        ratedJobUrls.size,
        'ratedCompanies:',
        ratedCompanies.size,
      )
    }

    const queryMatchStart = performance.now()
    setActiveOperation(`search:queryMatch (${ratingFilteredJobs.length} jobs, terms=${queryTerms.length})`)
    const matched = queryTerms.length > 0
      ? await asyncFilter(ratingFilteredJobs, (job) => jobMatchesQuery(job, queryTerms, logFlags.query === true), 500)
      : ratingFilteredJobs // If no query terms, consider all visible jobs as matched (subject to pagination later)
    const queryMatchMs = performance.now() - queryMatchStart
    clearActiveOperation('search:queryMatch')

    // Cap how many jobs get fully scored+sorted to protect memory.
    // We still report the true matched count; scoring only covers the first N jobs.
    // 20k gives 200 pages of 100 — more than enough for practical browsing.
    const MAX_SCORE_CANDIDATES = 20_000
    const totalMatchedCount = matched.length
    const jobsToScore = matched.length > MAX_SCORE_CANDIDATES ? matched.slice(0, MAX_SCORE_CANDIDATES) : matched

    const resumeText = typeof searchPayload.resumeText === 'string' ? searchPayload.resumeText : ''
    const locationText = typeof searchPayload.locationText === 'string' ? searchPayload.locationText : ''

    // Geocode user location
    const userGeocodeStart = performance.now()
    setActiveOperation(`search:userGeocode ("${locationText}")`)
    const userLocCoords = locationText.length > 0 ? await geocodeUserLocation(locationText, logFlags.location === true) : null
    const userLat = userLocCoords?.lat ?? null
    const userLon = userLocCoords?.lon ?? null
    const hasUsableUserCoords =
      typeof userLat === 'number' &&
      typeof userLon === 'number' &&
      Number.isFinite(userLat) &&
      Number.isFinite(userLon)

    const userGeocodeMs = performance.now() - userGeocodeStart
    clearActiveOperation('search:userGeocode')

    if (logSearchMain) {
      console.log('User location geocoded to:', userLocCoords, 'for location text:', locationText)
    }
    // return { matched: [], size: matched.length }

    // Geocoding every job location is expensive and only helps when user coordinates exist.
    // For empty/failed location input paths, skip this entirely and rely on text/remote scoring.
    const hasValidJobCoords = (job: ScrapedJob): boolean => {
      const lat = job.location_lat
      const lon = job.location_lon
      return typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)
    }
    const geoCountBefore = debugEnabled && hasUsableUserCoords ? matched.filter(hasValidJobCoords).length : 0
    const jobGeocodeStart = performance.now()
    setActiveOperation(`search:jobGeocode (${matched.length} matched)`)
    const jobsWithCoords = matched
    const jobGeocodeMs = performance.now() - jobGeocodeStart
    clearActiveOperation('search:jobGeocode')
    const geoCountAfter = debugEnabled && hasUsableUserCoords ? jobsWithCoords.filter(hasValidJobCoords).length : 0
    const jobGeoHadCoords = geoCountBefore
    const jobGeoNewlyGeocoded = geoCountAfter - geoCountBefore
    const jobGeoSkipped = hasUsableUserCoords ? matched.length - geoCountAfter : matched.length

    // Calculate scores for each job and create wrappers
    const scoreRankStart = performance.now()
    // Pre-tokenize AND deduplicate the resume once — passed to each job scorer so neither
    // tokenize() nor Set-dedup runs per job.
    const precomputedResumeTokens = resumeText.length > 0 ? Array.from(new Set(tokenize(resumeText))) : []
    const scoringTimings: ScoreTimings | undefined = debugEnabled
      ? { resumeMs: 0, locationMs: 0, freshnessMs: 0, auditMs: 0, qolMs: 0, impactMs: 0 }
      : undefined
    const scoreMapStart = performance.now()
    setActiveOperation(`search:score (${jobsToScore.length} jobs)`)
    const unsortedWrappers = await asyncMap(jobsToScore, (job) => {
        const scores = calculateIndividualScores(job, resumeText, locationText, userLat, userLon, logFlags, precomputedResumeTokens, scoringTimings)
        const addedJobBonus = job.source === 'AddedByUser'
          ? Math.max(0.45, Number.isFinite(job.audit_number) ? Number(job.audit_number) / 100 : 0.45)
          : 0
        // Calculate total score using weights
        const totalScore =
          (scores.resume ?? 0) * (searchPayload.scoreWeights?.resume ?? 1) +
          (scores.impact ?? 0) * (searchPayload.scoreWeights?.impact ?? 1) +
          (scores.location ?? 0) * (searchPayload.scoreWeights?.location ?? 1) +
          (scores.fresh ?? 0) * (searchPayload.scoreWeights?.fresh ?? 1) +
          (scores.audit ?? 0) * (searchPayload.scoreWeights?.audit ?? 1) +
          (scores.qualityOfLife ?? 0) * (searchPayload.scoreWeights?.qualityOfLife ?? 1) +
          addedJobBonus

        return {
          job,
          scores,
          totalScore,
          aiPayload: buildJobAiPayload(job),
          debugInfo: debugEnabled
            ? { lat: typeof job.location_lat === 'number' ? job.location_lat : null, lon: typeof job.location_lon === 'number' ? job.location_lon : null }
            : undefined,
        }
      })
    const scoreTotalMs = performance.now() - scoreMapStart
    clearActiveOperation('search:score')
    const scoreSortStart = performance.now()
    setActiveOperation(`search:sort (${unsortedWrappers.length} wrappers)`)
    const rankedWrappers = unsortedWrappers.sort((a, b) => b.totalScore - a.totalScore)
    const scoreSortMs = performance.now() - scoreSortStart
    clearActiveOperation('search:sort')
    const scoreRankMs = performance.now() - scoreRankStart

    const userRatingSortStart = performance.now()
    setActiveOperation('search:ratingSort')
    const sortedByUserRatingWrappers = userRatingMode === 'none'
      ? rankedWrappers
      : rankedWrappers
          .map((wrapper, originalIndex) => {
            const userRating = getEffectiveUserRating(wrapper.job, jobRatingMap, companyRatingMap)

            return {
              wrapper,
              originalIndex,
              userRating,
            }
          })
          .sort((a, b) => {
            const aHasRating = a.userRating !== null
            const bHasRating = b.userRating !== null

            if (aHasRating !== bHasRating) {
              return aHasRating ? -1 : 1
            }

            if (aHasRating && bHasRating) {
              if (a.userRating !== b.userRating) {
                return Number(b.userRating) - Number(a.userRating)
              }

              return a.originalIndex - b.originalIndex
            }

            return a.originalIndex - b.originalIndex
          })
          .map((entry) => entry.wrapper)
    const userRatingSortMs = performance.now() - userRatingSortStart
    clearActiveOperation('search:ratingSort')

    const start = Number.isInteger(searchPayload.start) ? Number(searchPayload.start) : 0
    const end = Number.isInteger(searchPayload.end) ? Number(searchPayload.end) : sortedByUserRatingWrappers.length
    const totalMs = performance.now() - searchStart
    const meta: SearchResultMeta = {
      aiCoverage: buildSearchAiCoverage(sortedByUserRatingWrappers),
      scoreDistribution: buildScoreDistribution(sortedByUserRatingWrappers),
      appliedFilters: {
        includeRemoteJobs,
        userRatingMode,
      },
      debugInfo: debugEnabled ? (() => {
        let hiddenByUrl = 0
        let hiddenByCompany = 0
        for (const job of jobsForSearch) {
          const sourceUrl = normalizeExactUrl(job.source_url)
          const companyName = normalizeExactCompanyName(job.company_name)
          if (sourceUrl && hiddenJobUrls.has(sourceUrl)) {
            hiddenByUrl++
          } else if (companyName && hiddenCompanies.has(companyName)) {
            hiddenByCompany++
          }
        }
        return {
          userLat,
          userLon,
          locationText,
          query: rawQuery,
          totalJobsInput: jobs.length,
          totalJobsVisible: visibleJobs.length,
          totalJobsMatched: matched.length,
          timings: {
            filterMs: Number(filterMs.toFixed(2)),
            queryMatchMs: Number(queryMatchMs.toFixed(2)),
            userGeocodeMs: Number(userGeocodeMs.toFixed(2)),
            jobGeocodeMs: Number(jobGeocodeMs.toFixed(2)),
            jobGeoHadCoords,
            jobGeoNewlyGeocoded,
            jobGeoSkipped,
            scoreTotalMs: Number(scoreTotalMs.toFixed(2)),
            scoreResumeMs: Number((scoringTimings?.resumeMs ?? 0).toFixed(2)),
            scoreLocationMs: Number((scoringTimings?.locationMs ?? 0).toFixed(2)),
            scoreFreshnessMs: Number((scoringTimings?.freshnessMs ?? 0).toFixed(2)),
            scoreAuditMs: Number((scoringTimings?.auditMs ?? 0).toFixed(2)),
            scoreQolMs: Number((scoringTimings?.qolMs ?? 0).toFixed(2)),
            scoreImpactMs: Number((scoringTimings?.impactMs ?? 0).toFixed(2)),
            scoreSortMs: Number(scoreSortMs.toFixed(2)),
            userRatingSortMs: Number(userRatingSortMs.toFixed(2)),
            totalMs: Number(totalMs.toFixed(2)),
          },
          exclusions: {
            hiddenByUrl,
            hiddenByCompany,
            remoteJobsFiltered: visibleJobs.length - remoteFilteredJobs.length,
            userRatingFiltered: remoteFilteredJobs.length - ratingFilteredJobs.length,
            userRatingFilterMode: userRatingMode,
            queryMismatch: ratingFilteredJobs.length - matched.length,
          },
        }
      })() : undefined,
    }

    if (start < 0 || end < 0 || end <= start) {
      return { matched: sortedByUserRatingWrappers, size: totalMatchedCount, meta }
    }

    console.log(
      `[SearchMain] phases (ms): filter=${filterMs.toFixed(1)} queryMatch=${queryMatchMs.toFixed(1)} userGeocode=${userGeocodeMs.toFixed(1)} jobGeocode=${jobGeocodeMs.toFixed(1)} scoreRank=${scoreRankMs.toFixed(1)} userRatingSort=${userRatingSortMs.toFixed(1)} | total=${totalMs.toFixed(1)} | input=${jobs.length} visible=${visibleJobs.length} matched=${totalMatchedCount} scored=${jobsToScore.length} query="${rawQuery}"`,
    )

    if (logSearchMain) {
      console.log(sortedByUserRatingWrappers.length, 'jobs matched the query. Returning ranked slice from', start, 'to', end)
      console.log('SearchPayload: ' + JSON.stringify(searchPayload))
    }

    const sliced = sortedByUserRatingWrappers.slice(start, end)
    // sliced.map((wrapper, index) => {
    //   const shouldLaunch = true
    //   wrapper.scores.audit = Math.min(auditJob(wrapper.job, logFlags.audit === true, shouldLaunch) / 100, 1.0)
    // })

    // Store in cache (exclude debugInfo — timing data is not stable across requests)
    if (searchFingerprint !== null) {
      this.setCached(searchFingerprint, {
        wrappers: sortedByUserRatingWrappers,
        size: totalMatchedCount,
        meta: { aiCoverage: meta.aiCoverage, scoreDistribution: meta.scoreDistribution, appliedFilters: meta.appliedFilters },
      })
    }

    return { matched: sliced, size: totalMatchedCount, meta }
  }
}

// Re-export interfaces for backwards compatibility
export type {
  ScoreWeights,
  SearchPayload,
  SearchLogFlags,
  JobScores,
  JobAiPayload,
  SearchAiCoverage,
  SearchScoreBucket,
  SearchResultMeta,
  RankedJobWrapper,
} from './SearchInterfaces.js'

export default SearchMain
