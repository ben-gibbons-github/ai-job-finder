import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { clearActiveOperation, setActiveOperation } from '../../server/ServerActivityTracker.js'
import { getEmployerBadgeEligibility } from '../../utils/EmployerBadgeEligibility.js'
import type { RankedJobWrapper, SearchLogFlags, SearchPayload, UserRatingMode } from '../SearchInterfaces.js'
import { getLocationScoreDebugInfo } from '../searchDistance/SearchDistance.js'
import { getEmployerImpactCategoriesForJob } from '../EmployerImpactCategoryStore.js'
import { isEmployerImpactCategory, type EmployerImpactCategory } from '../EmployerImpactCategory.js'
import { tokenize } from '../SearchResumeMatch.js'
import { calculateIndividualScores, type ScoreTimings } from '../SearchUtils.js'
import { buildJobAiLookupKey, getEffectiveUserRating, getJobDebugFlag } from './helpers.js'
import { buildJobAiPayload } from './metrics.js'

export interface RankingResult {
  sortedByUserRatingWrappers: RankedJobWrapper[]
  scoringTimings: ScoreTimings | undefined
  scoreTotalMs: number
  scoreSortMs: number
  scoreRankMs: number
  userRatingSortMs: number
}

export function rankSearchResults(input: {
  preFilteredJobs: ScrapedJob[]
  searchPayload: SearchPayload
  logFlags: SearchLogFlags
  resumeText: string
  locationText: string
  userLat: number | null
  userLon: number | null
  debugEnabled: boolean
  userRatingMode: UserRatingMode
  companyRatingMap: Map<string, number>
}): RankingResult {
  const {
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
  } = input

  const scoreRankStart = performance.now()
  const precomputedResumeTokens = resumeText.length > 0 ? Array.from(new Set(tokenize(resumeText))) : []
  const scoringTimings: ScoreTimings | undefined = debugEnabled
    ? { resumeMs: 0, locationMs: 0, freshnessMs: 0, auditMs: 0, qolMs: 0, impactMs: 0 }
    : undefined

  setActiveOperation(`search:score (${preFilteredJobs.length} jobs)`)
  const scoreMapStart = performance.now()
  const unsortedWrappers = preFilteredJobs
    .map((job) => {
      const scores = calculateIndividualScores(job, resumeText, locationText, userLat, userLon, logFlags, precomputedResumeTokens, scoringTimings)
      const addedJobBonus = job.source === 'AddedByUser'
        ? Math.max(0.45, Number.isFinite(job.audit_number) ? Number(job.audit_number) / 100 : 0.45)
        : 0
      const totalScore =
        (scores.resume ?? 0) * (searchPayload.scoreWeights?.resume ?? 1) +
        (scores.impact ?? 0) * (searchPayload.scoreWeights?.impact ?? 1) +
        (scores.location ?? 0) * (searchPayload.scoreWeights?.location ?? 1) +
        (scores.fresh ?? 0) * (searchPayload.scoreWeights?.fresh ?? 1) +
        (scores.audit ?? 0) * (searchPayload.scoreWeights?.audit ?? 1) +
        (scores.qualityOfLife ?? 0) * (searchPayload.scoreWeights?.qualityOfLife ?? 1) +
        addedJobBonus
      const badgeEligibility = getEmployerBadgeEligibility(job.scrapedEmployer)

      return {
        job,
        scores,
        totalScore,
        debug_flag: getJobDebugFlag(job),
        aiPayload: buildJobAiPayload(job),
        employerImpactCategories: getEmployerImpactCategoriesForJob(job),
        isEligibleForEmployerImpactBadges: badgeEligibility.eligible,
        employerImpactBadgeEligibilityReason: badgeEligibility.reason,
        debugInfo: debugEnabled
          ? {
            lat: typeof job.location_lat === 'number' ? job.location_lat : null,
            lon: typeof job.location_lon === 'number' ? job.location_lon : null,
            location: getLocationScoreDebugInfo(userLat, userLon, job, locationText),
            promptVersion: job.scrapedEmployer?.promptVersion?.trim() || '1.0',
            aiPrompt: job.scrapedEmployer?.aiPrompt,
            aiCacheKey: buildJobAiLookupKey(job),
          }
          : undefined,
      } satisfies RankedJobWrapper
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
        const userRating = getEffectiveUserRating(wrapper.job, companyRatingMap)

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

  const prioritizedCategory = isEmployerImpactCategory(searchPayload.prioritizedEmployerImpactCategory)
    ? searchPayload.prioritizedEmployerImpactCategory
    : null
  // employerImpactCategories is ordered primary, secondary, tertiary — lower slot index ranks higher.
  const badgeSlotRank = (wrapper: RankedJobWrapper, category: EmployerImpactCategory): number => {
    const slotIndex = (wrapper.employerImpactCategories ?? []).indexOf(category)
    return slotIndex === -1 ? Number.POSITIVE_INFINITY : slotIndex
  }
  const badgePrioritizedWrappers = prioritizedCategory
    ? [...sortedByUserRatingWrappers].sort((a, b) => badgeSlotRank(a, prioritizedCategory) - badgeSlotRank(b, prioritizedCategory))
    : sortedByUserRatingWrappers

  return {
    sortedByUserRatingWrappers: badgePrioritizedWrappers,
    scoringTimings,
    scoreTotalMs,
    scoreSortMs,
    scoreRankMs,
    userRatingSortMs,
  }
}
