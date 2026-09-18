import type { ScrapedJob } from '../../../scraping/core/ScrapedJob.js'
import { clearActiveOperation, setActiveOperation } from '../../../server/ServerActivityTracker.js'
import { jobMatchesQuery, type QueryMatchTelemetry } from '../../SearchUtils.js'
import { hasAnyUserRating, mergeAddedJobs, sanitizeAddedJobs } from '../helpers.js'
import {
  LARGE_MATCH_COUNTRY_FILTER_MIN_KEEP,
  LARGE_MATCH_COUNTRY_FILTER_THRESHOLD,
  QUERY_MATCH_LIMIT,
} from './constants.js'
import { buildFilteringContext } from './buildContext.js'
import { isEligibleJob, matchesPromptVersionFilter, matchesSourceSearchCountry } from './predicates.js'
import type {
  RunFilteringInput,
  SearchFilterAndMatchResult,
  SearchLogFlags,
  SearchPayload,
} from './types.js'

const FILTER_TIMING_SLOW_LOG_MS = 150

export async function runSearchFilteringAndMatching(
  jobs: ScrapedJob[],
  searchPayload: SearchPayload,
  rawQuery: string,
  queryTerms: string[],
  logFlags: SearchLogFlags,
  logSearchMain: boolean,
  hiddenExclusionsEnabled: boolean,
): Promise<SearchFilterAndMatchResult> {
  const setupStart = performance.now()
  const setupSectionMs = {
    buildContext: 0,
    sanitizeAddedJobs: 0,
    mergeJobsForSearch: 0,
  }

  const buildContextStart = performance.now()
  const input: RunFilteringInput = {
    jobs,
    searchPayload,
    rawQuery,
    queryTerms,
    logFlags,
    logSearchMain,
    hiddenExclusionsEnabled,
  }
  setupSectionMs.buildContext += performance.now() - buildContextStart

  const contextStart = performance.now()
  const context = buildFilteringContext(input)
  setupSectionMs.buildContext += performance.now() - contextStart
  const {
    includeRemoteJobs,
    userRatingMode,
    promptVersionFilter,
    sourceSearchCountry,
    preserveRatedBeyondLimit,
    companyRatingMap,
    ratedCompanies,
    hiddenJobUrls,
    hiddenCompanies,
  } = context

  const sanitizeAddedJobsStart = performance.now()
  const addedJobs = sanitizeAddedJobs(searchPayload.addedJobs)
  setupSectionMs.sanitizeAddedJobs += performance.now() - sanitizeAddedJobsStart

  const mergeJobsForSearchStart = performance.now()
  const jobsForSearch = mergeAddedJobs(jobs, addedJobs)
  setupSectionMs.mergeJobsForSearch += performance.now() - mergeJobsForSearchStart
  const setupMs = performance.now() - setupStart

  const filterStart = performance.now()
  setActiveOperation(`search:filter (${jobs.length} jobs, query="${rawQuery}")`)

  const sectionTotalsMs = {
    queryMatch: 0,
    eligibility: 0,
    ratingMode: 0,
    promptVersion: 0,
    matchLimit: 0,
    collectMatch: 0,
    sourceCountry: 0,
    mergeAdded: 0,
  }

  const exclusionCounts = {
    query: 0,
    eligibility: 0,
    ratingMode: 0,
    promptVersion: 0,
    matchLimit: 0,
  }

  const queryTelemetry: QueryMatchTelemetry = {
    calls: 0,
    haystackCacheHits: 0,
    haystackCacheMisses: 0,
    haystackBuildMs: 0,
    termChecks: 0,
    termCheckMs: 0,
    unknownTokenTerms: 0,
  }

  const matched: ScrapedJob[] = []
  const largeMatchCountryFilteredJobs: ScrapedJob[] = []
  const locationCountryCache = new Map<string, string | null>()
  let matchedWithinLimitCount = 0

  for (const job of jobs) {
    const queryStart = performance.now()
    const matchesQuery = queryTerms.length === 0 || jobMatchesQuery(job, queryTerms, logFlags.query === true, queryTelemetry)
    sectionTotalsMs.queryMatch += performance.now() - queryStart
    if (!matchesQuery) {
      exclusionCounts.query += 1
      continue
    }

    const eligibilityStart = performance.now()
    if (!isEligibleJob(job, context)) {
      sectionTotalsMs.eligibility += performance.now() - eligibilityStart
      exclusionCounts.eligibility += 1
      continue
    }
    sectionTotalsMs.eligibility += performance.now() - eligibilityStart

    const ratingStart = performance.now()
    const isUserRated = hasAnyUserRating(job, ratedCompanies)
    if (userRatingMode === 'ratedOnly' && !isUserRated) {
      sectionTotalsMs.ratingMode += performance.now() - ratingStart
      exclusionCounts.ratingMode += 1
      continue
    }
    if (userRatingMode === 'hideRated' && isUserRated) {
      sectionTotalsMs.ratingMode += performance.now() - ratingStart
      exclusionCounts.ratingMode += 1
      continue
    }
    sectionTotalsMs.ratingMode += performance.now() - ratingStart

    const promptVersionStart = performance.now()
    if (!matchesPromptVersionFilter(job, promptVersionFilter)) {
      sectionTotalsMs.promptVersion += performance.now() - promptVersionStart
      exclusionCounts.promptVersion += 1
      continue
    }
    sectionTotalsMs.promptVersion += performance.now() - promptVersionStart

    const matchLimitStart = performance.now()
    if (matchedWithinLimitCount >= QUERY_MATCH_LIMIT && (!preserveRatedBeyondLimit || !isUserRated)) {
      sectionTotalsMs.matchLimit += performance.now() - matchLimitStart
      exclusionCounts.matchLimit += 1
      if (!preserveRatedBeyondLimit) {
        break
      }
      continue
    }
    sectionTotalsMs.matchLimit += performance.now() - matchLimitStart

    const collectStart = performance.now()
    matched.push(job)
    if (matchedWithinLimitCount < QUERY_MATCH_LIMIT) {
      matchedWithinLimitCount += 1
    }
    sectionTotalsMs.collectMatch += performance.now() - collectStart

    const sourceCountryStart = performance.now()
    if (matchesSourceSearchCountry(job, sourceSearchCountry, isUserRated, locationCountryCache)) {
      largeMatchCountryFilteredJobs.push(job)
    }
    sectionTotalsMs.sourceCountry += performance.now() - sourceCountryStart
  }

  const mergeAddedStart = performance.now()
  const matchedWithAdded = mergeAddedJobs(matched, addedJobs)
  const largeMatchCountryFilteredWithAdded = mergeAddedJobs(largeMatchCountryFilteredJobs, addedJobs)
  sectionTotalsMs.mergeAdded += performance.now() - mergeAddedStart

  const queryMatchMs = performance.now() - filterStart

  const filterMs = performance.now() - filterStart
  clearActiveOperation('search:filter')

  if (logSearchMain || filterMs >= FILTER_TIMING_SLOW_LOG_MS) {
    console.log(
      '[SearchMain.filtering] section timings (ms):',
      JSON.stringify({
        setup: Number(setupMs.toFixed(2)),
        setupBuildContext: Number(setupSectionMs.buildContext.toFixed(2)),
        setupSanitizeAddedJobs: Number(setupSectionMs.sanitizeAddedJobs.toFixed(2)),
        setupMergeJobsForSearch: Number(setupSectionMs.mergeJobsForSearch.toFixed(2)),
        queryMatch: Number(sectionTotalsMs.queryMatch.toFixed(2)),
        queryCalls: queryTelemetry.calls,
        queryTermChecks: queryTelemetry.termChecks,
        queryUnknownTokenTerms: queryTelemetry.unknownTokenTerms,
        haystackCacheHits: queryTelemetry.haystackCacheHits,
        haystackCacheMisses: queryTelemetry.haystackCacheMisses,
        haystackBuildMs: Number(queryTelemetry.haystackBuildMs.toFixed(2)),
        queryTermCheckMs: Number(queryTelemetry.termCheckMs.toFixed(2)),
        eligibility: Number(sectionTotalsMs.eligibility.toFixed(2)),
        ratingMode: Number(sectionTotalsMs.ratingMode.toFixed(2)),
        promptVersion: Number(sectionTotalsMs.promptVersion.toFixed(2)),
        matchLimit: Number(sectionTotalsMs.matchLimit.toFixed(2)),
        collectMatch: Number(sectionTotalsMs.collectMatch.toFixed(2)),
        sourceCountry: Number(sectionTotalsMs.sourceCountry.toFixed(2)),
        mergeAdded: Number(sectionTotalsMs.mergeAdded.toFixed(2)),
        total: Number(filterMs.toFixed(2)),
        inputJobs: jobs.length,
        matchedBeforeAdded: matched.length,
        matchedAfterAdded: matchedWithAdded.length,
        countryFilteredBeforeAdded: largeMatchCountryFilteredJobs.length,
        countryFilteredAfterAdded: largeMatchCountryFilteredWithAdded.length,
        locationCountryCacheSize: locationCountryCache.size,
        excludedByQuery: exclusionCounts.query,
        excludedByEligibility: exclusionCounts.eligibility,
        excludedByRatingMode: exclusionCounts.ratingMode,
        excludedByPromptVersion: exclusionCounts.promptVersion,
        excludedByMatchLimit: exclusionCounts.matchLimit,
        query: rawQuery,
      }),
    )
  }

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
      'companyRatingMap:',
      companyRatingMap.size,
      'ratedCompanies:',
      ratedCompanies.size,
      'promptVersionFilter:',
      promptVersionFilter || 'all',
    )
  }

  const preFilteredJobs = matchedWithAdded.length >= LARGE_MATCH_COUNTRY_FILTER_THRESHOLD
    && sourceSearchCountry
    && largeMatchCountryFilteredWithAdded.length < LARGE_MATCH_COUNTRY_FILTER_MIN_KEEP
    ? matchedWithAdded
    : largeMatchCountryFilteredWithAdded

  if (logSearchMain && matchedWithAdded.length >= LARGE_MATCH_COUNTRY_FILTER_THRESHOLD) {
    console.log(
      '[SearchMain] large-match country filter:',
      'matched=',
      matchedWithAdded.length,
      'sourceSearchCountry=',
      sourceSearchCountry,
      'remaining=',
      preFilteredJobs.length,
      'dropped=',
      matchedWithAdded.length - preFilteredJobs.length,
      'fallbackApplied=',
      preFilteredJobs === matchedWithAdded,
    )
  }

  return {
    includeRemoteJobs,
    userRatingMode,
    promptVersionFilter,
    hiddenJobUrls,
    hiddenCompanies,
    jobsForSearch,
    matched: matchedWithAdded,
    preFilteredJobs,
    companyRatingMap,
    filterMs,
    queryMatchMs,
  }
}
