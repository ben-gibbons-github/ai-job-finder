import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { haversineDistance } from './haversineDistance.js'
import { detectCountryFromLocation } from './country.js'
import { detectJobCountry, getEffectiveJobLocation, getJobLocations, getLocationFallback } from './locationParts.js'
import { hasUnknownLocationAndRemote, isPurelyRemoteJob, isRemoteJob, isRemoteWithNoCountryAttached } from './remote.js'
import { toSafeText } from './text.js'

const env = {
  SEARCH_DEBUG_ENABLED: process.env.SEARCH_DEBUG_ENABLED === 'true',
} as const

export interface LocationScoreDebugInfo {
  userLat: number | null
  userLon: number | null
  jobLat: number | null
  jobLon: number | null
  matchedLocation: string | null
  locationFallback: string | null
  userCountry: string | null
  jobCountry: string | null
  countryPenalty: string
  distanceKm: number | null
  distanceMiles: number | null
  locationScore: number
  calculation: string
}

function calculateLocationScoreNoDebug(
  userLat: number | null,
  userLon: number | null,
  job: ScrapedJob,
  locationText: string,
  shouldLog: boolean,
): number {
  if (hasUnknownLocationAndRemote(job)) {
    if (shouldLog) {
      console.log(`Location score hard-zero for job "${job.name}": location and remote are both unknown`)
    }
    return 0
  }

  const userCountry = detectCountryFromLocation(locationText)
  const jobCountry = detectJobCountry(job, null, isPurelyRemoteJob(job) ? userCountry : null)
  const countriesDiffer = userCountry !== null && jobCountry !== null && userCountry !== jobCountry

  if (isPurelyRemoteJob(job)) {
    if (countriesDiffer) {
      if (shouldLog) {
        console.log(`Location score override for remote different-country job "${job.name}": 0.4000`)
      }
      return 0.4
    }

    if (isRemoteWithNoCountryAttached(job)) {
      if (shouldLog) {
        console.log(`Location score override for remote unknown-country job "${job.name}": 0.9500`)
      }
      return 0.95
    }

    if (shouldLog) {
      console.log(`Location score override for remote same-country job "${job.name}": 1.0000`)
    }
    return 1
  }

  const effectiveJobLocation = getEffectiveJobLocation(job)
  if (!effectiveJobLocation && !isRemoteJob(job)) {
    if (shouldLog) {
      console.log(`Location score hard-zero for non-remote job "${job.name}": location is unknown`)
    }
    return 0
  }

  let distanceScore = 0
  const normalizedJobLocation = toSafeText(effectiveJobLocation)
  const normalizedJobDescription = toSafeText(job.description)
  const hasValidJobCoordinates = typeof job.location_lat === 'number'
    && typeof job.location_lon === 'number'
    && Number.isFinite(job.location_lat)
    && Number.isFinite(job.location_lon)
    && !(job.location_lat === 0 && job.location_lon === 0)

  const primaryJobLat = hasValidJobCoordinates ? job.location_lat : null
  const primaryJobLon = hasValidJobCoordinates ? job.location_lon : null

  const coordinateCandidates = Array.isArray(job.location_coordinates)
    ? job.location_coordinates.filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon))
    : []

  const hasUsableUserCoordinates = userLat !== null
    && userLon !== null
    && Number.isFinite(userLat)
    && Number.isFinite(userLon)
  const nearestCandidate = hasUsableUserCoordinates && coordinateCandidates.length > 0
    ? coordinateCandidates.reduce((nearest, candidate) => (
      haversineDistance(userLat, userLon, candidate.lat, candidate.lon)
        < haversineDistance(userLat, userLon, nearest.lat, nearest.lon)
        ? candidate
        : nearest
    ))
    : null
  const jobLat = nearestCandidate?.lat ?? primaryJobLat
  const jobLon = nearestCandidate?.lon ?? primaryJobLon
  const hasUsableCoordinates = hasUsableUserCoordinates && jobLat !== null && jobLon !== null

  if (hasUsableCoordinates) {
    const latDelta = Math.abs(jobLat - userLat)
    const rawLonDelta = Math.abs(jobLon - userLon)
    const lonDelta = Math.min(rawLonDelta, 340 - rawLonDelta)
    if (latDelta >= 100 || lonDelta >= 100) {
      return 0
    }

    const distanceKm = haversineDistance(userLat, userLon, jobLat, jobLon)
    distanceScore = Math.max(0, Math.min(1, (100 - Math.sqrt(distanceKm)) / 100))
    if (countriesDiffer) {
      distanceScore *= 0.5
    }
    return distanceScore
  }

  const normalizedUserLocationText = toSafeText(locationText).trim()
  if (normalizedUserLocationText.length > 0) {
    const listedLocations = getJobLocations(job)
    const textMatchedLocation = listedLocations.find((candidate) => {
      const normalizedCandidate = toSafeText(candidate).trim()
      return normalizedCandidate.includes(normalizedUserLocationText)
        || normalizedUserLocationText.includes(normalizedCandidate)
    }) ?? null

    if (textMatchedLocation) {
      distanceScore = 0.4
    } else if (
      normalizedJobLocation.includes(normalizedUserLocationText) ||
      normalizedUserLocationText.includes(normalizedJobLocation)
    ) {
      distanceScore = 0.4
    } else {
      const userLocationTerms = normalizedUserLocationText.split(/\s+/).filter((term) => term.length >= 3)
      const hitCount = userLocationTerms.filter(
        (term) => normalizedJobLocation.includes(term) || normalizedJobDescription.includes(term),
      ).length
      if (hitCount > 0 && userLocationTerms.length > 0) {
        distanceScore = Math.min(0.5, hitCount / userLocationTerms.length)
      }
    }
  }

  if (countriesDiffer) {
    distanceScore *= 0.5
  }

  if (shouldLog) {
    console.log(`Final location score for job "${job.name}" at "${job.location}": ${distanceScore.toFixed(4)}`)
  }
  return distanceScore
}

function buildLocationScoreDebugInfo(
  userLat: number | null,
  userLon: number | null,
  job: ScrapedJob,
  locationText: string,
  shouldLog: boolean,
): LocationScoreDebugInfo {
  const hasValidJobCoordinates = typeof job.location_lat === 'number'
    && typeof job.location_lon === 'number'
    && Number.isFinite(job.location_lat)
    && Number.isFinite(job.location_lon)
    && !(job.location_lat === 0 && job.location_lon === 0)
  const primaryJobLat = hasValidJobCoordinates
    ? job.location_lat
    : null
  const primaryJobLon = hasValidJobCoordinates
    ? job.location_lon
    : null
  const coordinateCandidates = Array.isArray(job.location_coordinates)
    ? job.location_coordinates.filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon))
    : []
  const listedLocations = getJobLocations(job)
  const normalizedUserLocationText = toSafeText(locationText).trim()
  const textMatchedLocation = normalizedUserLocationText
    ? listedLocations.find((candidate) => {
      const normalizedCandidate = toSafeText(candidate).trim()
      return normalizedCandidate.includes(normalizedUserLocationText)
        || normalizedUserLocationText.includes(normalizedCandidate)
    }) ?? null
    : null
  const hasUsableUserCoordinates = userLat !== null
    && userLon !== null
    && Number.isFinite(userLat)
    && Number.isFinite(userLon)
  const nearestCandidate = hasUsableUserCoordinates && coordinateCandidates.length > 0
    ? coordinateCandidates.reduce((nearest, candidate) => (
      haversineDistance(userLat, userLon, candidate.lat, candidate.lon)
        < haversineDistance(userLat, userLon, nearest.lat, nearest.lon)
        ? candidate
        : nearest
    ))
    : null
  const jobLat = nearestCandidate?.lat ?? primaryJobLat
  const jobLon = nearestCandidate?.lon ?? primaryJobLon
  const scoringLocation = nearestCandidate?.label ?? textMatchedLocation
  const matchedLocation = listedLocations.length > 1 ? scoringLocation : null
  const locationFallback = getLocationFallback(job) || null
  const userCountry = detectCountryFromLocation(locationText)
  const jobCountry = detectJobCountry(job, scoringLocation, isPurelyRemoteJob(job) ? userCountry : null)
  const countriesDiffer = userCountry !== null && jobCountry !== null && userCountry !== jobCountry
  const base = {
    userLat,
    userLon,
    jobLat,
    jobLon,
    matchedLocation,
    locationFallback,
    userCountry,
    jobCountry,
    countryPenalty: countriesDiffer
      ? (isPurelyRemoteJob(job) ? 'Remote different-country override: score = 0.40' : '50% reduction')
      : (userCountry === null || jobCountry === null ? 'None; one or both countries were not detected' : 'None'),
    distanceKm: null,
    distanceMiles: null,
  }

  if (hasUnknownLocationAndRemote(job)) {
    if (shouldLog) {
      console.log(`Location score hard-zero for job "${job.name}": location and remote are both unknown`)
    }
    return {
      ...base,
      locationScore: 0,
      calculation: 'Location and remote are both unknown: score = 0.0000.',
    }
  }

  if (isPurelyRemoteJob(job)) {
    if (countriesDiffer) {
      if (shouldLog) {
        console.log(`Location score override for remote different-country job "${job.name}": 0.4000`)
      }
      return {
        ...base,
        locationScore: 0.4,
        calculation: `Remote job country (${jobCountry}) differs from user country (${userCountry}): score = 04000.`,
      }
    }

    if (isRemoteWithNoCountryAttached(job)) {
      if (shouldLog) {
        console.log(`Location score override for remote unknown-country job "${job.name}": 0.9500`)
      }
      return { ...base, locationScore: 0.95, calculation: 'Remote job without a country: score = 0.9500; geographic distance not used.' }
    }

    if (shouldLog) {
      console.log(`Location score override for remote same-country job "${job.name}": 1.0000`)
    }
    const countryDetail = userCountry !== null && jobCountry !== null
      ? ` Both are in ${userCountry}.`
      : ' No different-country restriction was detected.'
    return { ...base, locationScore: 1, calculation: `Remote-job override: score = 1.0000; geographic distance not used.${countryDetail}` }
  }

  const effectiveJobLocation = getEffectiveJobLocation(job)
  if (!effectiveJobLocation && !isRemoteJob(job)) {
    if (shouldLog) {
      console.log(`Location score hard-zero for non-remote job "${job.name}": location is unknown`)
    }
    return { ...base, locationScore: 0, calculation: 'Non-remote job has an unknown location: score = 0.0000.' }
  }

  let distanceScore = 0
  let calculation = 'No usable coordinates or location-text match: score = 0.0000.'
  const normalizedJobLocation = toSafeText(effectiveJobLocation)
  const normalizedJobDescription = toSafeText(job.description)
  const hasUsableCoordinates = userLat !== null
    && userLon !== null
    && Number.isFinite(userLat)
    && Number.isFinite(userLon)
    && jobLat !== null
    && jobLon !== null

  if (hasUsableCoordinates) {
    if (shouldLog) {
      console.log(`Calculating location score for job "${job.name}" at "${job.location}" with user location "${locationText} ${userLat}, ${userLon} job.location_lat: ${jobLat} job.location_lon: ${jobLon}"`)
    }

    const latDelta = Math.abs(jobLat - userLat)
    const rawLonDelta = Math.abs(jobLon - userLon)
    const lonDelta = Math.min(rawLonDelta, 340 - rawLonDelta)
    if (latDelta >= 100 || lonDelta >= 100) {
      if (shouldLog) {
        console.log(`Location score hard-zero for job "${job.name}": lat delta ${latDelta.toFixed(2)}° lon delta ${lonDelta.toFixed(2)}° (wrap-adjusted) exceed 100° threshold`)
      }
      return {
        ...base,
        locationScore: 0,
        calculation: `Coordinate sanity check: latitude delta ${latDelta.toFixed(2)}°, longitude delta ${lonDelta.toFixed(2)}°; delta >= 100°, so score = 0.0000.`,
      }
    }

    const distanceKm = haversineDistance(userLat, userLon, jobLat, jobLon)
    const distanceMiles = distanceKm * 0.621371
    distanceScore = Math.max(0, Math.min(1, (100 - Math.sqrt(distanceKm)) / 100))
    const nearestDetail = matchedLocation ? ` Nearest listed job location: ${matchedLocation}.` : ''
    calculation = `Haversine great-circle distance (Earth radius 6,371 km); score = clamp((100 - sqrt(${distanceKm.toFixed(2)} km)) / 100, 0, 1) = ${distanceScore.toFixed(4)}.${nearestDetail}`
    if (countriesDiffer) {
      distanceScore *= 0.5
      calculation += ` Job country (${jobCountry}) differs from user country (${userCountry}), so score is cut by 50% to ${distanceScore.toFixed(4)}.`
    }
    if (shouldLog) {
      console.log(`Calculated distance for job "${job.name}" at "${job.location}": ${distanceKm.toFixed(2)} km -> distanceScore: ${distanceScore.toFixed(4)}`)
    }
    return { ...base, distanceKm, distanceMiles, locationScore: distanceScore, calculation }
  }

  if (normalizedUserLocationText.length > 0) {
    if (textMatchedLocation) {
      distanceScore = 0.4
      calculation = `Coordinate lookup unavailable; listed location "${textMatchedLocation}" matches the user location, giving score = 0.4000.`
    } else if (
      normalizedJobLocation.includes(normalizedUserLocationText) ||
      normalizedUserLocationText.includes(normalizedJobLocation)
    ) {
      distanceScore = 0.4
      calculation = 'Coordinate lookup unavailable; full location-text overlap gives score = 0.4000.'
    } else {
      const userLocationTerms = normalizedUserLocationText.split(/\s+/).filter((term) => term.length >= 3)
      const hitCount = userLocationTerms.filter(
        (term) => normalizedJobLocation.includes(term) || normalizedJobDescription.includes(term),
      ).length
      if (hitCount > 0 && userLocationTerms.length > 0) {
        distanceScore = Math.min(0.5, hitCount / userLocationTerms.length)
        calculation = `Coordinate lookup unavailable; ${hitCount}/${userLocationTerms.length} location terms matched, capped at 0.5000, giving score = ${distanceScore.toFixed(4)}.`
      } else {
        calculation = 'Coordinate lookup unavailable and no location terms matched: score = 0.0000.'
      }
    }
  }

  if (countriesDiffer) {
    distanceScore *= 0.5
    calculation += ` Job country (${jobCountry}) differs from user country (${userCountry}), so score is cut by 50% to ${distanceScore.toFixed(4)}.`
  }
  if (shouldLog) {
    console.log(`Final location score for job "${job.name}" at "${job.location}": ${distanceScore.toFixed(4)}`)
  }
  return { ...base, matchedLocation, locationScore: distanceScore, calculation }
}

export function getLocationScoreDebugInfo(
  userLat: number | null,
  userLon: number | null,
  job: ScrapedJob,
  locationText: string,
): LocationScoreDebugInfo {
  if (!env.SEARCH_DEBUG_ENABLED) {
    return {
      userLat,
      userLon,
      jobLat: null,
      jobLon: null,
      matchedLocation: null,
      locationFallback: null,
      userCountry: null,
      jobCountry: null,
      countryPenalty: 'Debug disabled',
      distanceKm: null,
      distanceMiles: null,
      locationScore: calculateLocationScoreNoDebug(userLat, userLon, job, locationText, false),
      calculation: 'Location debug details are disabled unless SEARCH_DEBUG_ENABLED=true.',
    }
  }

  return buildLocationScoreDebugInfo(userLat, userLon, job, locationText, false)
}

export function calculateLocationScore(
  userLat: number | null,
  userLon: number | null,
  job: ScrapedJob,
  locationText: string,
  shouldLog = false,
): number {
  if (!env.SEARCH_DEBUG_ENABLED) {
    return calculateLocationScoreNoDebug(userLat, userLon, job, locationText, shouldLog)
  }

  return buildLocationScoreDebugInfo(userLat, userLon, job, locationText, shouldLog).locationScore
}
