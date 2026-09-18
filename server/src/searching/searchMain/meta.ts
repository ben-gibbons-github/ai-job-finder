import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import type {
  RankedJobWrapper,
  ScoreWeights,
  SearchDebugInfo,
  SearchResultMeta,
  UserRatingMode,
} from '../SearchInterfaces.js'
import { normalizeExactCompanyName, normalizeExactUrl } from './helpers.js'
import { buildScoreDistribution, buildSearchAiCoverage } from './metrics.js'

export function createCacheHitMeta(input: {
  cachedMeta: Omit<SearchResultMeta, 'debugInfo'>
  cachedSize: number
  hitMs: number
  debugEnabled: boolean
  locationText: string
  query: string
  userRatingMode: string
}): SearchResultMeta {
  const {
    cachedMeta,
    cachedSize,
    hitMs,
    debugEnabled,
    locationText,
    query,
    userRatingMode,
  } = input

  const zeroTimings: SearchDebugInfo['timings'] = {
    filterMs: 0,
    queryMatchMs: 0,
    userGeocodeMs: 0,
    jobGeocodeMs: 0,
    jobGeoHadCoords: 0,
    jobGeoNewlyGeocoded: 0,
    jobGeoSkipped: cachedSize,
    scoreTotalMs: 0,
    scoreResumeMs: 0,
    scoreLocationMs: 0,
    scoreFreshnessMs: 0,
    scoreAuditMs: 0,
    scoreQolMs: 0,
    scoreImpactMs: 0,
    scoreSortMs: 0,
    userRatingSortMs: 0,
    totalMs: hitMs,
  }

  return {
    ...cachedMeta,
    debugInfo: debugEnabled
      ? {
        cacheHit: true,
        userLat: null,
        userLon: null,
        locationText,
        query,
        totalJobsInput: 0,
        totalJobsVisible: 0,
        totalJobsMatched: cachedSize,
        timings: zeroTimings,
        exclusions: {
          hiddenByUrl: 0,
          hiddenByCompany: 0,
          remoteJobsFiltered: 0,
          userRatingFiltered: 0,
          promptVersionFiltered: 0,
          userRatingFilterMode: userRatingMode,
          queryMismatch: 0,
        },
      }
      : undefined,
  }
}

export function createSearchMeta(input: {
  wrappers: RankedJobWrapper[]
  scoreWeights?: ScoreWeights
  includeRemoteJobs: boolean
  userRatingMode: UserRatingMode
  promptVersionFilter: string
  debugEnabled: boolean
  userLat: number | null
  userLon: number | null
  locationText: string
  query: string
  jobs: ScrapedJob[]
  jobsForSearch: ScrapedJob[]
  matched: ScrapedJob[]
  hiddenJobUrls: Set<string>
  hiddenCompanies: Set<string>
  filterMs: number
  queryMatchMs: number
  userGeocodeMs: number
  jobGeocodeMs: number
  jobGeoHadCoords: number
  jobGeoNewlyGeocoded: number
  jobGeoSkipped: number
  scoreTotalMs: number
  scoreResumeMs: number
  scoreLocationMs: number
  scoreFreshnessMs: number
  scoreAuditMs: number
  scoreQolMs: number
  scoreImpactMs: number
  scoreSortMs: number
  userRatingSortMs: number
  totalMs: number
}): SearchResultMeta {
  const {
    wrappers,
    scoreWeights,
    includeRemoteJobs,
    userRatingMode,
    promptVersionFilter,
    debugEnabled,
    userLat,
    userLon,
    locationText,
    query,
    jobs,
    jobsForSearch,
    matched,
    hiddenJobUrls,
    hiddenCompanies,
    filterMs,
    queryMatchMs,
    userGeocodeMs,
    jobGeocodeMs,
    jobGeoHadCoords,
    jobGeoNewlyGeocoded,
    jobGeoSkipped,
    scoreTotalMs,
    scoreResumeMs,
    scoreLocationMs,
    scoreFreshnessMs,
    scoreAuditMs,
    scoreQolMs,
    scoreImpactMs,
    scoreSortMs,
    userRatingSortMs,
    totalMs,
  } = input

  return {
    aiCoverage: buildSearchAiCoverage(wrappers),
    scoreDistribution: buildScoreDistribution(wrappers, scoreWeights),
    appliedFilters: {
      includeRemoteJobs,
      userRatingMode,
      promptVersionFilter: promptVersionFilter || null,
    },
    debugInfo: debugEnabled
      ? (() => {
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
          query,
          totalJobsInput: jobs.length,
          totalJobsVisible: matched.length,
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
            scoreResumeMs: Number(scoreResumeMs.toFixed(2)),
            scoreLocationMs: Number(scoreLocationMs.toFixed(2)),
            scoreFreshnessMs: Number(scoreFreshnessMs.toFixed(2)),
            scoreAuditMs: Number(scoreAuditMs.toFixed(2)),
            scoreQolMs: Number(scoreQolMs.toFixed(2)),
            scoreImpactMs: Number(scoreImpactMs.toFixed(2)),
            scoreSortMs: Number(scoreSortMs.toFixed(2)),
            userRatingSortMs: Number(userRatingSortMs.toFixed(2)),
            totalMs: Number(totalMs.toFixed(2)),
          },
          exclusions: {
            hiddenByUrl,
            hiddenByCompany,
            remoteJobsFiltered: 0,
            userRatingFiltered: 0,
            promptVersionFiltered: 0,
            userRatingFilterMode: userRatingMode,
            queryMismatch: 0,
          },
        }
      })()
      : undefined,
  }
}
