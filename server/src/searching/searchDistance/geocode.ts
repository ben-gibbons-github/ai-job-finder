import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { setActiveOperation, clearActiveOperation } from '../../server/ServerActivityTracker.js'
import { lookupCityFallback } from '../../utils/CityFallbackLookup.js'
import { nameToLonLat, normalizeLocationName } from '../../utils/NameToLonLat.js'
import { getEffectiveJobLocation, getJobLocations } from './locationParts.js'
import { isPurelyRemoteJob } from './remote.js'

export async function geocodeUserLocation(
  locationText: string,
  shouldLog = false,
): Promise<{ lat: number; lon: number } | null> {
  if (locationText.trim().length === 0) {
    return null
  }

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
  } catch {
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

// not called as part of search
export async function geocodeJobLocations(jobs: ScrapedJob[], shouldLog = false): Promise<ScrapedJob[]> {
  const inFlightByLocation = new Map<string, Promise<{ lat: number; lon: number }>>()

  const hasValidCoords = (job: ScrapedJob): boolean => {
    const { location_lat: lat, location_lon: lon } = job
    return typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)
  }

  const hasAllLocationCoordinates = (job: ScrapedJob): boolean => {
    const locations = getJobLocations(job)
    return locations.length <= 1 || (
      Array.isArray(job.location_coordinates)
      && job.location_coordinates.length === locations.length
      && job.location_coordinates.every((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon))
    )
  }

  const shouldSkipGeocodeForJob = (job: ScrapedJob): boolean => {
    const effectiveLocation = getEffectiveJobLocation(job)
    if (!effectiveLocation) {
      return true
    }
    if (isPurelyRemoteJob(job)) {
      return true
    }
    return false
  }

  setActiveOperation(`geocode:filterNeeding (${jobs.length} jobs)`)
  const jobsNeedingGeocode = jobs.filter((job) => (!hasValidCoords(job) || !hasAllLocationCoordinates(job)) && !shouldSkipGeocodeForJob(job))
  clearActiveOperation('geocode:filterNeeding')

  if (jobsNeedingGeocode.length === 0) {
    return jobs
  }

  setActiveOperation(`geocode:lookupLocations (${jobsNeedingGeocode.length} jobs)`)
  await Promise.all(
    jobsNeedingGeocode.map(async (job) => {
      const locations = getJobLocations(job)
      const resolvedLocations = await Promise.all(locations.map(async (location) => {
        const locationKey = normalizeLocationName(location)
        try {
          if (!inFlightByLocation.has(locationKey)) {
            inFlightByLocation.set(locationKey, nameToLonLat(location))
          }
          const coordinates = await inFlightByLocation.get(locationKey)!
          return { label: location, lat: coordinates.lat, lon: coordinates.lon }
        } catch {
          return null
        }
      }))
      const validLocations = resolvedLocations.filter((location): location is NonNullable<typeof location> => location !== null)

      if (validLocations.length > 0) {
        job.location_lat = validLocations[0].lat
        job.location_lon = validLocations[0].lon
        job.location_coordinates = locations.length > 1 ? validLocations : undefined
      } else {
        job.location_lat = NaN
        job.location_lon = NaN
        job.location_coordinates = undefined
      }
    }),
  )
  clearActiveOperation('geocode:lookupLocations')

  return jobs
}
