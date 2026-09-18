import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { COUNTRY_ALIASES } from './constants.js'
import { detectCountryFromLocation, detectCountryFromTextValue } from './country.js'
import { toSafeText } from './text.js'

export function parseJobLocations(location: string): string[] {
  const parts = String(location ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) {
    return parts
  }

  const finalPart = parts.at(-1) ?? ''
  const sharedCountry = detectCountryFromLocation(finalPart)
  const finalPartIsCountry = sharedCountry !== null
    && COUNTRY_ALIASES.some((entry) => entry.canonical === sharedCountry && entry.aliases.some((alias) => finalPart.toLowerCase() === alias))

  if (!finalPartIsCountry) {
    return parts
  }

  return parts.slice(0, -1).map((part) => detectCountryFromLocation(part) ? part : `${part}, ${finalPart}`)
}

export function getLocationFallback(job: ScrapedJob): string {
  return String(job.scrapedEmployer?.location_fallback ?? '').trim()
}

export function hasGenericOrMissingLocation(job: ScrapedJob): boolean {
  const location = toSafeText(job.location).trim()
  if (!location || location === 'unknown' || location === 'n/a' || location === 'na') {
    return true
  }

  return /^(remote|anywhere|distributed|work from home|remote only|remote role|remote job)$/i.test(location)
}

export function getEffectiveJobLocation(job: ScrapedJob): string {
  return hasGenericOrMissingLocation(job) ? getLocationFallback(job) : String(job.location ?? '').trim()
}

export function getJobLocations(job: ScrapedJob): string[] {
  return parseJobLocations(getEffectiveJobLocation(job))
}

export function detectJobCountry(job: ScrapedJob, preferredLocation?: string | null, preferredCountry?: string | null): string | null {
  const preferredLocationCountry = preferredLocation ? detectCountryFromLocation(preferredLocation) : null
  if (preferredLocationCountry) {
    return preferredLocationCountry
  }

  const listedCountries = getJobLocations(job)
    .map((location) => detectCountryFromLocation(location))
    .filter((country): country is string => country !== null)
  if (preferredCountry && listedCountries.includes(preferredCountry)) {
    return preferredCountry
  }

  return listedCountries[0]
    ?? detectCountryFromLocation(getLocationFallback(job))
    ?? detectCountryFromTextValue(`${job.description} ${job.type}`)
}
