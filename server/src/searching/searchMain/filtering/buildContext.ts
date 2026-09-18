import { detectCountryFromLocation } from '../../searchDistance/SearchDistance.js'
import {
  buildUserRatingMap,
  normalizeExactCompanyName,
  normalizePromptVersionFilter,
  parseUserRatingMode,
} from '../helpers.js'
import type { FilteringContext, RunFilteringInput } from './types.js'

export function buildFilteringContext(input: RunFilteringInput): FilteringContext {
  const { searchPayload, hiddenExclusionsEnabled } = input

  const userRatingMode = parseUserRatingMode(searchPayload.userRatingMode)
  const companyRatingMap = userRatingMode !== 'none'
    ? buildUserRatingMap(searchPayload.userRatings?.companyRatingsByName, normalizeExactCompanyName)
    : new Map<string, number>()

  const ratedCompanies = userRatingMode === 'ratedOnly' || userRatingMode === 'hideRated' || userRatingMode === 'sort'
    ? new Set([
      ...Array.from(companyRatingMap.keys()),
      ...(Array.isArray(searchPayload.userRatingFilter?.ratedCompanies)
        ? searchPayload.userRatingFilter.ratedCompanies
          .map((value: unknown) => normalizeExactCompanyName(value))
          .filter((value: string) => value.length > 0)
        : []),
    ])
    : new Set<string>()

  const hiddenJobUrls = hiddenExclusionsEnabled && Array.isArray(searchPayload.hiddenJobUrls)
    ? new Set(
      searchPayload.hiddenJobUrls
        .map((value: unknown) => String(value ?? '').trim())
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

  const includeRemoteJobs = searchPayload.includeRemoteJobs !== false
  const locationText = typeof searchPayload.locationText === 'string' ? searchPayload.locationText : ''
  const sourceSearchCountry = detectCountryFromLocation(locationText)
  const promptVersionFilter = normalizePromptVersionFilter(searchPayload.promptVersionFilter)

  const preserveRatedBeyondLimit =
    userRatingMode !== 'none' ||
    ratedCompanies.size > 0 ||
    companyRatingMap.size > 0

  return {
    includeRemoteJobs,
    userRatingMode,
    promptVersionFilter,
    sourceSearchCountry,
    preserveRatedBeyondLimit,
    companyRatingMap,
    ratedCompanies,
    hiddenJobUrls,
    hiddenCompanies,
  }
}
