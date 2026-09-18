import type { ScrapedJob } from '../../../scraping/core/ScrapedJob.js'
import { detectCountryFromLocation, getJobLocations, isRemoteJob } from '../../searchDistance/SearchDistance.js'
import { normalizeExactCompanyName, normalizeExactUrl } from '../helpers.js'
import type { FilteringContext } from './types.js'

export function isEligibleJob(job: ScrapedJob, context: FilteringContext): boolean {
  const sourceUrl = normalizeExactUrl(job.source_url)
  const companyName = normalizeExactCompanyName(job.company_name)

  if (sourceUrl && context.hiddenJobUrls.has(sourceUrl)) {
    return false
  }

  if (companyName && context.hiddenCompanies.has(companyName)) {
    return false
  }

  if (!context.includeRemoteJobs && isRemoteJob(job)) {
    return false
  }

  return true
}

export function matchesPromptVersionFilter(job: ScrapedJob, promptVersionFilter: string): boolean {
  if (promptVersionFilter.length === 0) {
    return true
  }

  const promptVersion = String(job.scrapedEmployer?.promptVersion ?? '').trim() || '1.0'
  return promptVersion === promptVersionFilter
}

export function matchesSourceSearchCountry(
  job: ScrapedJob,
  sourceSearchCountry: string | null,
  isUserRated: boolean,
  locationCountryCache: Map<string, string | null>,
): boolean {
  if (!sourceSearchCountry) {
    return true
  }

  if (isUserRated) {
    return true
  }

  const locations = getJobLocations(job)
  const knownCountries: string[] = []

  for (const location of locations) {
    if (!locationCountryCache.has(location)) {
      locationCountryCache.set(location, detectCountryFromLocation(location))
    }

    const country = locationCountryCache.get(location)
    if (country !== null && country !== undefined) {
      knownCountries.push(country)
    }
  }

  if (knownCountries.length === 0) {
    return true
  }

  return knownCountries.includes(sourceSearchCountry)
}
