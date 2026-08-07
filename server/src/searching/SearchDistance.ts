import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import { nameToLonLat } from '../utils/NameToLonLat.js'
import { lookupCityFallback } from '../utils/CityFallbackLookup.js'
import { setActiveOperation, clearActiveOperation } from '../utils/ServerActivityTracker.js'

/**
 * Distance and location-based scoring functionality
 * Handles geographic distance calculations and remote job detection
 */

/**
 * Helper function to convert degrees to radians
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Calculates the great-circle distance between two geographic points
 * using the Haversine formula
 * 
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in kilometers
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Helper function to safely convert any value to lowercase text
 */
function toSafeText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).toLowerCase()
}

interface CountryAlias {
  canonical: string
  aliases: string[]
}

const COUNTRY_ALIASES: CountryAlias[] = [
  { canonical: 'united states', aliases: ['united states', 'united states of america', 'usa', 'us'] },
  { canonical: 'united kingdom', aliases: ['united kingdom', 'uk', 'great britain', 'britain', 'england'] },
  { canonical: 'canada', aliases: ['canada'] },
  { canonical: 'australia', aliases: ['australia'] },
  { canonical: 'new zealand', aliases: ['new zealand'] },
  { canonical: 'germany', aliases: ['germany', 'deutschland'] },
  { canonical: 'france', aliases: ['france'] },
  { canonical: 'spain', aliases: ['spain'] },
  { canonical: 'italy', aliases: ['italy'] },
  { canonical: 'netherlands', aliases: ['netherlands', 'holland'] },
  { canonical: 'sweden', aliases: ['sweden'] },
  { canonical: 'norway', aliases: ['norway'] },
  { canonical: 'denmark', aliases: ['denmark'] },
  { canonical: 'finland', aliases: ['finland'] },
  { canonical: 'ireland', aliases: ['ireland'] },
  { canonical: 'switzerland', aliases: ['switzerland'] },
  { canonical: 'austria', aliases: ['austria'] },
  { canonical: 'belgium', aliases: ['belgium'] },
  { canonical: 'portugal', aliases: ['portugal'] },
  { canonical: 'poland', aliases: ['poland'] },
  { canonical: 'czechia', aliases: ['czechia', 'czech republic'] },
  { canonical: 'romania', aliases: ['romania'] },
  { canonical: 'hungary', aliases: ['hungary'] },
  { canonical: 'greece', aliases: ['greece'] },
  { canonical: 'india', aliases: ['india'] },
  { canonical: 'pakistan', aliases: ['pakistan'] },
  { canonical: 'bangladesh', aliases: ['bangladesh'] },
  { canonical: 'japan', aliases: ['japan'] },
  { canonical: 'south korea', aliases: ['south korea', 'korea'] },
  { canonical: 'singapore', aliases: ['singapore'] },
  { canonical: 'philippines', aliases: ['philippines'] },
  { canonical: 'thailand', aliases: ['thailand'] },
  { canonical: 'vietnam', aliases: ['vietnam'] },
  { canonical: 'indonesia', aliases: ['indonesia'] },
  { canonical: 'malaysia', aliases: ['malaysia'] },
  { canonical: 'united arab emirates', aliases: ['united arab emirates', 'uae'] },
  { canonical: 'saudi arabia', aliases: ['saudi arabia'] },
  { canonical: 'israel', aliases: ['israel'] },
  { canonical: 'turkiye', aliases: ['turkiye', 'turkey'] },
  { canonical: 'south africa', aliases: ['south africa'] },
  { canonical: 'nigeria', aliases: ['nigeria'] },
  { canonical: 'kenya', aliases: ['kenya'] },
  { canonical: 'egypt', aliases: ['egypt'] },
  { canonical: 'mexico', aliases: ['mexico'] },
  { canonical: 'brazil', aliases: ['brazil'] },
  { canonical: 'argentina', aliases: ['argentina'] },
  { canonical: 'chile', aliases: ['chile'] },
  { canonical: 'colombia', aliases: ['colombia'] },
  { canonical: 'peru', aliases: ['peru'] },
]

function detectCountryFromText(text: string): string | null {
  const normalized = toSafeText(text)
  if (!normalized) {
    return null
  }

  for (const entry of COUNTRY_ALIASES) {
    for (const alias of entry.aliases) {
      const pattern = new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i')
      if (pattern.test(normalized)) {
        return entry.canonical
      }
    }
  }

  return null
}

function isPurelyRemoteJob(job: ScrapedJob): boolean {
  const loc = toSafeText(job.location)
  const typ = toSafeText(job.remote) + ' ' + toSafeText(job.type)
  const combined = `${loc} ${typ}`
  const hasRemoteSignal = /\bremote\b|\banywhere\b|\bdistributed\b|work from home/.test(combined)
  return hasRemoteSignal
}

function hasGenericOrMissingLocation(job: ScrapedJob): boolean {
  const location = toSafeText(job.location).trim()
  if (!location || location === 'unknown' || location === 'n/a' || location === 'na') {
    return true
  }

  return /^(remote|anywhere|distributed|work from home|remote only|remote role|remote job)$/i.test(location)
}

function isRemoteSameCountryAsOrigin(job: ScrapedJob, locationText: string): boolean {
  const originCountry = detectCountryFromText(locationText)
  if (!originCountry) {
    return false
  }

  const jobCountry = detectCountryFromText(`${job.location} ${job.description} ${job.type}`)
  return jobCountry !== null && jobCountry === originCountry
}

function isRemoteWithNoCountryAttached(job: ScrapedJob): boolean {
  if (!isPurelyRemoteJob(job) || !hasGenericOrMissingLocation(job)) {
    return false
  }

  const jobCountry = detectCountryFromText(`${job.location} ${job.description} ${job.type}`)
  return jobCountry === null
}

/**
 * Detects if a job is marked as remote or work-from-home
 * 
 * Uses heuristics to check job type and location for remote keywords
 * 
 * @param job - The job to check
 * @returns true if the job appears to be remote
 */
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

/**
 * Calculates the location score based on geographic distance and remote status
 * 
 * Score is normalized to 0-1 range:
 * - Remote jobs get a base score of 0.5
 * - Distance-based score is calculated using Haversine distance
 * - Takes the maximum of both approaches
 * 
 * @param userLat - User's latitude (or null if not available)
 * @param userLon - User's longitude (or null if not available)
 * @param job - The job being scored
 * @param locationText - User's location text input (checked for "remote" keyword)
 * @returns Location score between 0 and 1
 */
export function calculateLocationScore(
  userLat: number | null,
  userLon: number | null,
  job: ScrapedJob,
  locationText: string,
  shouldLog = false
): number {
  if (isPurelyRemoteJob(job)) {
    if (shouldLog) {
      console.log(`Location score override for remote same-country job "${job.name}": 1.0000`)
    }
    return 1
  }

  if (isRemoteWithNoCountryAttached(job)) {
    if (shouldLog) {
      console.log(`Location score override for remote unknown-country job "${job.name}": 0.9500`)
    }
    return 0.95
  }

  let distanceScore = 0
  const normalizedUserLocationText = toSafeText(locationText).trim()
  const normalizedJobLocation = toSafeText(job.location)
  const normalizedJobDescription = toSafeText(job.description)

  // Calculate distance-based score if coordinates are available
  if (
    userLat !== null &&
    userLon !== null &&
    Number.isFinite(userLat) &&
    Number.isFinite(userLon) &&
    typeof job.location_lat === 'number' &&
    typeof job.location_lon === 'number' &&
    Number.isFinite(job.location_lat) &&
    Number.isFinite(job.location_lon)
  ) {
  
    if (shouldLog) {
      console.log(`Calculating location score for job "${job.name}" at "${job.location}" with user location "${locationText} ${userLat}, ${userLon} job.location_lat: ${job.location_lat} job.location_lon: ${job.location_lon}"`)
    }

    const latDelta = Math.abs(job.location_lat - userLat)
    const rawLonDelta = Math.abs(job.location_lon - userLon)
    const lonDelta = Math.min(rawLonDelta, 360 - rawLonDelta)
    if (latDelta >= 100 || lonDelta >= 100) {
      if (shouldLog) {
        console.log(`Location score hard-zero for job "${job.name}": lat delta ${latDelta.toFixed(2)}° lon delta ${lonDelta.toFixed(2)}° (wrap-adjusted) exceed 12° threshold`)
      }
      return 0
    }

    const distanceKm = haversineDistance(userLat, userLon, job.location_lat, job.location_lon)
    
    // Clamp to keep location score in [0, 1]
    distanceScore = Math.max(0, Math.min(1, (100 - Math.sqrt(distanceKm)) / 100))
    if (shouldLog) {
      console.log(`Calculated distance for job "${job.name}" at "${job.location}": ${distanceKm.toFixed(2)} km -> distanceScore: ${distanceScore.toFixed(4)}`)
    }
  } else if (normalizedUserLocationText.length > 0) {
    // Geocoding fallback: award a text-match score when user/job locations overlap.
    if (
      normalizedJobLocation.includes(normalizedUserLocationText) ||
      normalizedUserLocationText.includes(normalizedJobLocation)
    ) {
      distanceScore = Math.max(0.6, distanceScore)
    } else {
      const userLocationTerms = normalizedUserLocationText.split(/\s+/).filter((t) => t.length >= 3)
      const hitCount = userLocationTerms.filter(
        (term) => normalizedJobLocation.includes(term) || normalizedJobDescription.includes(term)
      ).length
      if (hitCount > 0 && userLocationTerms.length > 0) {
        distanceScore = Math.max(distanceScore, Math.min(0.5, hitCount / userLocationTerms.length))
      }
    }
  }
  

  if (shouldLog) {
    const remote = isRemoteJob(job) || normalizedUserLocationText.includes('remote')
    console.log(`Final location score for job "${job.name}" at "${job.location}": ${distanceScore.toFixed(4)}`)
  }
  return distanceScore
}

/**
 * Geocodes the user's location text to latitude/longitude coordinates
 * 
 * @param locationText - User's location text (city, region, etc.)
 * @returns Object with lat/lon, or null if geocoding fails or text is empty
 */
export async function geocodeUserLocation(
  locationText: string,
  shouldLog = false
): Promise<{ lat: number; lon: number } | null> {
  if (locationText.trim().length === 0) {
    return null
  }

  // Race the real geocoder against a 5-second timeout.
  // If the geocoder wins → use its result (it also self-caches to disk).
  // If the timeout wins → use the city fallback table as a temporary
  // substitute for this search only (NOT cached to disk).
  const GEOCODE_TIMEOUT_MS = 5000

  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), GEOCODE_TIMEOUT_MS),
  )

  try {
    const geoLabel = `geocode:userLocation "${locationText}"`
    setActiveOperation(geoLabel)
    const result = await Promise.race([nameToLonLat(locationText), timeoutPromise])
    clearActiveOperation(geoLabel)

    if (result === 'timeout') {
      // Primary geocoder stalled — try city fallback without caching
      const fallback = lookupCityFallback(locationText)
      if (fallback) {
        if (shouldLog) {
          console.warn(`[geocodeUserLocation] Geocoder timed out for "${locationText}", using city fallback: ${JSON.stringify(fallback)}`)
        }
        return fallback
      }
      console.warn(`[geocodeUserLocation] Geocoder timed out for "${locationText}" and no city fallback found`)
      return null
    }

    if (shouldLog) {
      console.log('Geocoding user location:', locationText, '->', result)
    }
    return { lat: result.lat, lon: result.lon }
  } catch (e) {
    // Geocoder threw — try city fallback without caching
    const fallback = lookupCityFallback(locationText)
    if (fallback) {
      if (shouldLog) {
        console.warn(`[geocodeUserLocation] Geocoder failed for "${locationText}", using city fallback: ${JSON.stringify(fallback)}`)
      }
      return fallback
    }
    return null
  }
}

/**
 * Geocodes job locations for all jobs that are missing coordinates
 * 
 * Updates job.location_lat and job.location_lon for jobs that have no valid coordinates
 * 
 * @param jobs - Array of jobs to geocode
 * @returns Array of jobs with updated location coordinates
 */
export async function geocodeJobLocations(jobs: ScrapedJob[], shouldLog = false): Promise<ScrapedJob[]> {
  const inFlightByLocation = new Map<string, Promise<{ lat: number; lon: number }>>()

  const normalizeLocationKey = (value: string): string => String(value).trim().toLowerCase()

  const hasValidCoords = (job: ScrapedJob): boolean => {
    const { location_lat: lat, location_lon: lon } = job
    return typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)
  }

  const shouldSkipGeocodeForJob = (job: ScrapedJob): boolean => {
    if (!job.location) {
      return true
    }
    // Remote/generic locations do not benefit from geocoding and often create noisy lookups.
    if (isPurelyRemoteJob(job) || hasGenericOrMissingLocation(job)) {
      return true
    }
    return false
  }

  // Filter to only jobs that actually need geocoding — avoids creating async
  // closures for the (majority of) jobs that already have valid coordinates.
  setActiveOperation(`geocode:filterNeeding (${jobs.length} jobs)`)
  const jobsNeedingGeocode = jobs.filter((job) => !hasValidCoords(job) && !shouldSkipGeocodeForJob(job))
  clearActiveOperation('geocode:filterNeeding')

  if (jobsNeedingGeocode.length === 0) {
    return jobs
  }

  setActiveOperation(`geocode:lookupLocations (${jobsNeedingGeocode.length} jobs)`)
  await Promise.all(
    jobsNeedingGeocode.map(async (job) => {
      const locationKey = normalizeLocationKey(job.location)
      try {
        if (!inFlightByLocation.has(locationKey)) {
          inFlightByLocation.set(locationKey, nameToLonLat(job.location))
        }
        const loc = await inFlightByLocation.get(locationKey)!
        job.location_lat = loc.lat
        job.location_lon = loc.lon
      } catch {
        job.location_lat = NaN
        job.location_lon = NaN
      }
    }),
  )
  clearActiveOperation('geocode:lookupLocations')

  return jobs
}
