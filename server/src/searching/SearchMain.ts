

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
  RankedJobWrapper,
} from './SearchInterfaces.js'
import { auditJob } from './SearchAudit.js'
import { geocodeUserLocation, geocodeJobLocations, isRemoteJob } from './SearchDistance.js'
import { calculateIndividualScores, jobMatchesQuery } from './SearchUtils.js'

const SERVER_HIDDEN_EXCLUSIONS_ENABLED = true

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
  async search(jobs: ScrapedJob[], searchPayload: SearchPayload): Promise<{ matched: RankedJobWrapper[]; size: number; meta: SearchResultMeta }> {
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

    const visibleJobs = jobsForSearch.filter((job) => {
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
      : visibleJobs.filter((job) => !isRemoteJob(job))

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
      ? remoteFilteredJobs.filter((job) => hasAnyUserRating(job, ratedJobUrls, ratedCompanies))
      : userRatingMode === 'hideRated'
        ? remoteFilteredJobs.filter((job) => !hasAnyUserRating(job, ratedJobUrls, ratedCompanies))
        : remoteFilteredJobs

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

    const matched = queryTerms.length > 0
      ? ratingFilteredJobs.filter((job) => jobMatchesQuery(job, queryTerms, logFlags.query === true))
      : ratingFilteredJobs // If no query terms, consider all visible jobs as matched (subject to pagination later)

    const resumeText = typeof searchPayload.resumeText === 'string' ? searchPayload.resumeText : ''
    const locationText = typeof searchPayload.locationText === 'string' ? searchPayload.locationText : ''

    // Geocode user location
    const userLocCoords = locationText.length > 0 ? await geocodeUserLocation(locationText, logFlags.location === true) : null
    const userLat = userLocCoords?.lat ?? null
    const userLon = userLocCoords?.lon ?? null
    const hasUsableUserCoords =
      typeof userLat === 'number' &&
      typeof userLon === 'number' &&
      Number.isFinite(userLat) &&
      Number.isFinite(userLon)

    if (logSearchMain) {
      console.log('User location geocoded to:', userLocCoords, 'for location text:', locationText)
    }
    // return { matched: [], size: matched.length }

    // Geocoding every job location is expensive and only helps when user coordinates exist.
    // For empty/failed location input paths, skip this entirely and rely on text/remote scoring.
    const jobsWithCoords = hasUsableUserCoords
      ? await geocodeJobLocations(matched, logFlags.location === true)
      : matched

    // Calculate scores for each job and create wrappers
    const rankedWrappers = jobsWithCoords
      .map((job) => {
        const scores = calculateIndividualScores(job, resumeText, locationText, userLat, userLon, logFlags)
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
          addedJobBonus;
          
        return {
          job,
          scores,
          totalScore,
          aiPayload: buildJobAiPayload(job),
        }
      })
      .sort((a, b) => b.totalScore - a.totalScore)

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

    const start = Number.isInteger(searchPayload.start) ? Number(searchPayload.start) : 0
    const end = Number.isInteger(searchPayload.end) ? Number(searchPayload.end) : sortedByUserRatingWrappers.length
    const meta: SearchResultMeta = {
      aiCoverage: buildSearchAiCoverage(sortedByUserRatingWrappers),
      scoreDistribution: buildScoreDistribution(sortedByUserRatingWrappers),
      appliedFilters: {
        includeRemoteJobs,
        userRatingMode,
      },
    }

    if (start < 0 || end < 0 || end <= start) {
      return { matched: sortedByUserRatingWrappers, size: sortedByUserRatingWrappers.length, meta }
    }

    if (logSearchMain) {
      console.log(sortedByUserRatingWrappers.length, 'jobs matched the query. Returning ranked slice from', start, 'to', end)
      console.log('SearchPayload: ' + JSON.stringify(searchPayload))
    }

    const sliced = sortedByUserRatingWrappers.slice(start, end)
    // sliced.map((wrapper, index) => {
    //   const shouldLaunch = true
    //   wrapper.scores.audit = Math.min(auditJob(wrapper.job, logFlags.audit === true, shouldLaunch) / 100, 1.0)
    // })
    return { matched: sliced, size: sortedByUserRatingWrappers.length, meta }
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
