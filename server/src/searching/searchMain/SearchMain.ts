

import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import type {
  ScoreWeights,
  SearchPayload,
  SearchLogFlags,
  JobScores,
  JobAiPayload,
  SearchAiCoverage,
  SearchResultMeta,
  SearchScoreBucket,
  RankedJobWrapper,
} from '../SearchInterfaces.js'
import { geocodeUserLocation } from '../searchDistance/SearchDistance.js'
import { setActiveOperation, clearActiveOperation } from '../../server/ServerActivityTracker.js'
import { buildSearchFingerprint } from './fingerprint.js'
import { runSearchFilteringAndMatching } from './filtering/runSearchFilteringAndMatching.js'
import { rankSearchResults } from './ranking.js'
import { createSearchMeta } from './meta.js'
import SearchCache from './SearchCache.js'

export { getJobDebugFlag } from './helpers.js'
export { buildScoreDistribution } from './metrics.js'

const SERVER_HIDDEN_EXCLUSIONS_ENABLED = true
const SEARCH_META_ENABLED = process.env.SEARCH_DEBUG_ENABLED === 'true'

// Caches full sorted result sets (pre-pagination) keyed on a fingerprint of all
// search settings EXCEPT start/end. Pagination then slices from the cached list.

class SearchMain {
  private readonly searchCache = new SearchCache()

  clearCache(): void {
    this.searchCache.clear()
  }

  async search(jobs: ScrapedJob[], searchPayload: SearchPayload, debugEnabled = false): Promise<{ matched: RankedJobWrapper[]; size: number; meta: SearchResultMeta }> {
    const searchStart = performance.now()
    const sectionMs: Record<string, number> = {}
    const markSection = (name: string, sectionStart: number): void => {
      sectionMs[name] = Number((performance.now() - sectionStart).toFixed(2))
    }
    const cacheGeneration = this.searchCache.generation
    const logFlags: SearchLogFlags = searchPayload.searchLogFlags ?? {}
    const logSearchMain = logFlags.searchMain === true
    const hiddenExclusionsEnabled = SERVER_HIDDEN_EXCLUSIONS_ENABLED

    const queryPrepStart = performance.now()
    const rawQueryValue = searchPayload.query
    const rawQuery = typeof rawQueryValue === 'string' ? rawQueryValue : ''
    const queryTerms = rawQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim().replace(/[^a-z0-9]/g, ''))
      .filter((term) => term.length > 0)
    markSection('queryPrep', queryPrepStart)

    // ─── Cache lookup ────────────────────────────────────────────────────────
    // Audit commands have side effects and are never cached.
    const searchFingerprint = buildSearchFingerprint(searchPayload)

    const cacheLookupStart = performance.now()
    if (searchFingerprint !== null) {
      const cacheHit = this.searchCache.getLookupResult(
        searchFingerprint,
        searchPayload,
        debugEnabled,
        rawQuery,
        searchStart,
      )
      if (cacheHit !== null) {
        markSection('cacheLookup', cacheLookupStart)
        markSection('total', searchStart)
        console.log(
          '[SearchMain] section timings (ms):',
          JSON.stringify({
            ...sectionMs,
            path: 'cache-hit',
            query: rawQuery,
          }),
        )
        console.log(`[SearchMain] cache hit (${cacheHit.hitMs}ms) query="${rawQuery}" returning ${cacheHit.matched.length}/${cacheHit.size}`)
        return { matched: cacheHit.matched, size: cacheHit.size, meta: cacheHit.meta }
      }
    }
    markSection('cacheLookup', cacheLookupStart)
    // ────────────────────────────────────────────────────────────────────────

    const filteringStart = performance.now()
    const filtering = await runSearchFilteringAndMatching(
      jobs,
      searchPayload,
      rawQuery,
      queryTerms,
      logFlags,
      logSearchMain,
      hiddenExclusionsEnabled,
    )
    markSection('filtering', filteringStart)
    const {
      includeRemoteJobs,
      userRatingMode,
      promptVersionFilter,
      hiddenJobUrls,
      hiddenCompanies,
      jobsForSearch,
      matched,
      preFilteredJobs,
      companyRatingMap,
      filterMs,
      queryMatchMs,
    } = filtering

    const resumeText = typeof searchPayload.resumeText === 'string' ? searchPayload.resumeText : ''
    const locationText = typeof searchPayload.locationText === 'string' ? searchPayload.locationText : ''

    // Geocode user location
    const userGeocodeStart = performance.now()
    setActiveOperation(`search:userGeocode ("${locationText}")`)
    const userLocCoords = locationText.length > 0 ? await geocodeUserLocation(locationText, logFlags.location === true) : null
    const userLat = userLocCoords?.lat ?? null
    const userLon = userLocCoords?.lon ?? null

    const userGeocodeMs = performance.now() - userGeocodeStart
    markSection('userGeocode', userGeocodeStart)
    clearActiveOperation('search:userGeocode')

    if (logSearchMain) {
      console.log('User location geocoded to:', userLocCoords, 'for location text:', locationText)
    }
    // return { matched: [], size: matched.length }

    const rankingStart = performance.now()
    const ranked = rankSearchResults({
      preFilteredJobs,
      searchPayload,
      logFlags,
      resumeText,
      locationText,
      userLat,
      userLon,
      debugEnabled,
      userRatingMode,
      companyRatingMap,
    })
    markSection('ranking', rankingStart)
    const {
      sortedByUserRatingWrappers,
      scoringTimings,
      scoreTotalMs,
      scoreSortMs,
      scoreRankMs,
      userRatingSortMs,
    } = ranked

    const start = Number.isInteger(searchPayload.start) ? Number(searchPayload.start) : 0
    const end = Number.isInteger(searchPayload.end) ? Number(searchPayload.end) : sortedByUserRatingWrappers.length
    const totalMs = performance.now() - searchStart
    const metaStart = performance.now()
    const meta: SearchResultMeta = SEARCH_META_ENABLED
      ? createSearchMeta({
        wrappers: sortedByUserRatingWrappers,
        scoreWeights: searchPayload.scoreWeights,
        includeRemoteJobs,
        userRatingMode,
        promptVersionFilter,
        debugEnabled,
        userLat,
        userLon,
        locationText,
        query: rawQuery,
        jobs,
        jobsForSearch,
        matched,
        hiddenJobUrls,
        hiddenCompanies,
        filterMs,
        queryMatchMs,
        userGeocodeMs,
        jobGeocodeMs: 0,
        jobGeoHadCoords: 0,
        jobGeoNewlyGeocoded: 0,
        jobGeoSkipped: preFilteredJobs.length,
        scoreTotalMs,
        scoreResumeMs: scoringTimings?.resumeMs ?? 0,
        scoreLocationMs: scoringTimings?.locationMs ?? 0,
        scoreFreshnessMs: scoringTimings?.freshnessMs ?? 0,
        scoreAuditMs: scoringTimings?.auditMs ?? 0,
        scoreQolMs: scoringTimings?.qolMs ?? 0,
        scoreImpactMs: scoringTimings?.impactMs ?? 0,
        scoreSortMs,
        userRatingSortMs,
        totalMs,
      })
      : {
        aiCoverage: {
          auditPercent: 0,
          impactPercent: 0,
          qualityOfLifePercent: 0,
          geocodedPercent: 0,
          totalMatched: sortedByUserRatingWrappers.length,
        },
        scoreDistribution: [],
        appliedFilters: {
          includeRemoteJobs,
          userRatingMode,
          promptVersionFilter: promptVersionFilter || null,
        },
      }
    markSection('meta', metaStart)

    const paginationStart = performance.now()
    const shouldReturnWholeSet = start < 0 || end < 0 || end <= start
    const sliced = shouldReturnWholeSet
      ? sortedByUserRatingWrappers
      : sortedByUserRatingWrappers.slice(start, end)
    markSection('pagination', paginationStart)

    const cacheStoreStart = performance.now()
    if (searchFingerprint !== null && cacheGeneration === this.searchCache.generation) {
      this.searchCache.set(searchFingerprint, {
        wrappers: sortedByUserRatingWrappers,
        size: sortedByUserRatingWrappers.length,
        meta: { aiCoverage: meta.aiCoverage, scoreDistribution: meta.scoreDistribution, appliedFilters: meta.appliedFilters },
      })
    }
    markSection('cacheStore', cacheStoreStart)

    markSection('total', searchStart)
    console.log(
      '[SearchMain] section timings (ms):',
      JSON.stringify({
        ...sectionMs,
        path: 'cache-miss',
        query: rawQuery,
      }),
    )

    if (shouldReturnWholeSet) {
      return { matched: sortedByUserRatingWrappers, size: sortedByUserRatingWrappers.length, meta }
    }

    console.log(
      `[SearchMain] phases (ms): filter=${filterMs.toFixed(1)} queryMatch=${queryMatchMs.toFixed(1)} userGeocode=${userGeocodeMs.toFixed(1)} jobGeocode=0.0 scoreRank=${scoreRankMs.toFixed(1)} userRatingSort=${userRatingSortMs.toFixed(1)} | total=${totalMs.toFixed(1)} | input=${jobs.length} visible=${matched.length} matched=${matched.length} query="${rawQuery}"`,
    )

    if (logSearchMain) {
      console.log(sortedByUserRatingWrappers.length, 'jobs matched the query. Returning ranked slice from', start, 'to', end)
      console.log('SearchPayload: ' + JSON.stringify(searchPayload))
    }

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
} from '../SearchInterfaces.js'

export default SearchMain
