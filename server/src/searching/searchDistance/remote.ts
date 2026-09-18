import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { detectCountryFromLocation } from './country.js'
import { detectJobCountry, hasGenericOrMissingLocation } from './locationParts.js'
import { toSafeText } from './text.js'

function isUnknownText(value: unknown): boolean {
  const normalized = toSafeText(value).trim()
  return normalized.length === 0
    || normalized === 'unknown'
    || normalized === 'unkown'
    || normalized === 'n/a'
    || normalized === 'na'
}

export function isPurelyRemoteJob(job: ScrapedJob): boolean {
  const loc = toSafeText(job.location)
  const typ = toSafeText(job.remote) + ' ' + toSafeText(job.type)
  const combined = `${loc} ${typ}`
  const hasRemoteSignal = /\bremote\b|\banywhere\b|\bdistributed\b|work from home/.test(combined)
  return hasRemoteSignal
}

export function hasUnknownLocationAndRemote(job: ScrapedJob): boolean {
  return isUnknownText(job.location) && isUnknownText(job.remote)
}

export function isRemoteWithNoCountryAttached(job: ScrapedJob): boolean {
  if (!isPurelyRemoteJob(job) || !hasGenericOrMissingLocation(job)) {
    return false
  }

  const jobCountry = detectJobCountry(job)
  return jobCountry === null
}

export function isRemoteJob(job: ScrapedJob): boolean {
  const remoteKeywords = ['remote', 'anywhere', 'distributed', 'work from home']
  const loc = toSafeText(job.location)
  const rem = toSafeText(job.remote)
  const typ = toSafeText(job.type)
  const desc = toSafeText(job.description)
  return remoteKeywords.some((kw) =>
    loc.includes(kw) || rem.includes(kw) || typ.includes(kw) || desc.includes(kw),
  )
}

export function detectUserCountry(locationText: string): string | null {
  return detectCountryFromLocation(locationText)
}
