import { nameToLonLat, normalizeLocationName } from '../utils/NameToLonLat.js';
import { hasUnitedStatesStateAbbreviation, lookupCityFallback } from '../utils/CityFallbackLookup.js';
import { setActiveOperation, clearActiveOperation } from '../utils/ServerActivityTracker.js';
/**
 * Distance and location-based scoring functionality
 * Handles geographic distance calculations and remote job detection
 */
export const LOCATION_SCORING_VERSION = '7';
/**
 * Helper function to convert degrees to radians
 */
function toRad(deg) {
    return (deg * Math.PI) / 180;
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
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
/**
 * Helper function to safely convert any value to lowercase text
 */
function toSafeText(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).toLowerCase();
}
const COUNTRY_ALIASES = [
    { canonical: 'united states', aliases: ['united states', 'united states of america', 'usa'] },
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
    { canonical: 'poland', aliases: ['poland', 'polska'] },
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
];
const LOCATION_COUNTRY_HINTS = [
    { canonical: 'united kingdom', aliases: ['cambridgeshire', 'reading'] },
    { canonical: 'belgium', aliases: ['brussels'] },
];
function containsAlias(text, alias) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${escapedAlias}([^a-z]|$)`, 'i').test(text);
}
function detectCountryFromText(text) {
    const normalized = toSafeText(text);
    if (!normalized) {
        return null;
    }
    for (const entry of COUNTRY_ALIASES) {
        for (const alias of entry.aliases) {
            if (containsAlias(normalized, alias)) {
                return entry.canonical;
            }
        }
    }
    return null;
}
export function detectCountryFromLocation(text) {
    const explicitCountry = detectCountryFromText(text);
    if (explicitCountry !== null) {
        return explicitCountry;
    }
    if (/(^|[^a-z])u\.?s\.?(?:a\.?)([^a-z]|$)/i.test(text) || hasUnitedStatesStateAbbreviation(text)) {
        return 'united states';
    }
    for (const entry of LOCATION_COUNTRY_HINTS) {
        if (entry.aliases.some((alias) => containsAlias(text, alias))) {
            return entry.canonical;
        }
    }
    return null;
}
export function parseJobLocations(location) {
    const parts = String(location ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length <= 1) {
        return parts;
    }
    const finalPart = parts.at(-1) ?? '';
    const sharedCountry = detectCountryFromLocation(finalPart);
    const finalPartIsCountry = sharedCountry !== null
        && COUNTRY_ALIASES.some((entry) => entry.canonical === sharedCountry && entry.aliases.some((alias) => finalPart.toLowerCase() === alias));
    if (!finalPartIsCountry) {
        return parts;
    }
    return parts.slice(0, -1).map((part) => detectCountryFromLocation(part) ? part : `${part}, ${finalPart}`);
}
function getLocationFallback(job) {
    return String(job.scrapedEmployer?.location_fallback ?? '').trim();
}
function getEffectiveJobLocation(job) {
    return hasGenericOrMissingLocation(job) ? getLocationFallback(job) : String(job.location ?? '').trim();
}
export function getJobLocations(job) {
    return parseJobLocations(getEffectiveJobLocation(job));
}
function detectJobCountry(job, preferredLocation, preferredCountry) {
    const preferredLocationCountry = preferredLocation ? detectCountryFromLocation(preferredLocation) : null;
    if (preferredLocationCountry) {
        return preferredLocationCountry;
    }
    const listedCountries = getJobLocations(job)
        .map((location) => detectCountryFromLocation(location))
        .filter((country) => country !== null);
    if (preferredCountry && listedCountries.includes(preferredCountry)) {
        return preferredCountry;
    }
    return listedCountries[0]
        ?? detectCountryFromLocation(getLocationFallback(job))
        ?? detectCountryFromText(`${job.description} ${job.type}`);
}
function isPurelyRemoteJob(job) {
    const loc = toSafeText(job.location);
    const typ = toSafeText(job.remote) + ' ' + toSafeText(job.type);
    const combined = `${loc} ${typ}`;
    const hasRemoteSignal = /\bremote\b|\banywhere\b|\bdistributed\b|work from home/.test(combined);
    return hasRemoteSignal;
}
function hasGenericOrMissingLocation(job) {
    const location = toSafeText(job.location).trim();
    if (!location || location === 'unknown' || location === 'n/a' || location === 'na') {
        return true;
    }
    return /^(remote|anywhere|distributed|work from home|remote only|remote role|remote job)$/i.test(location);
}
function isUnknownText(value) {
    const normalized = toSafeText(value).trim();
    return normalized.length === 0
        || normalized === 'unknown'
        || normalized === 'unkown'
        || normalized === 'n/a'
        || normalized === 'na';
}
function hasUnknownLocationAndRemote(job) {
    return isUnknownText(job.location) && isUnknownText(job.remote);
}
function isRemoteWithNoCountryAttached(job) {
    if (!isPurelyRemoteJob(job) || !hasGenericOrMissingLocation(job)) {
        return false;
    }
    const jobCountry = detectJobCountry(job);
    return jobCountry === null;
}
/**
 * Detects if a job is marked as remote or work-from-home
 *
 * Uses heuristics to check job type and location for remote keywords
 *
 * @param job - The job to check
 * @returns true if the job appears to be remote
 */
export function isRemoteJob(job) {
    const remoteKeywords = ['remote', 'anywhere', 'distributed', 'work from home'];
    const loc = toSafeText(job.location);
    const rem = toSafeText(job.remote);
    const typ = toSafeText(job.type);
    const desc = toSafeText(job.description);
    return remoteKeywords.some((kw) => loc.includes(kw) || rem.includes(kw) || typ.includes(kw) || desc.includes(kw));
}
function buildLocationScoreDebugInfo(userLat, userLon, job, locationText, shouldLog) {
    const hasValidJobCoordinates = typeof job.location_lat === 'number'
        && typeof job.location_lon === 'number'
        && Number.isFinite(job.location_lat)
        && Number.isFinite(job.location_lon)
        && !(job.location_lat === 0 && job.location_lon === 0);
    const primaryJobLat = hasValidJobCoordinates
        ? job.location_lat
        : null;
    const primaryJobLon = hasValidJobCoordinates
        ? job.location_lon
        : null;
    const coordinateCandidates = Array.isArray(job.location_coordinates)
        ? job.location_coordinates.filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon))
        : [];
    const listedLocations = getJobLocations(job);
    const normalizedUserLocationText = toSafeText(locationText).trim();
    const textMatchedLocation = normalizedUserLocationText
        ? listedLocations.find((candidate) => {
            const normalizedCandidate = toSafeText(candidate).trim();
            return normalizedCandidate.includes(normalizedUserLocationText)
                || normalizedUserLocationText.includes(normalizedCandidate);
        }) ?? null
        : null;
    const hasUsableUserCoordinates = userLat !== null
        && userLon !== null
        && Number.isFinite(userLat)
        && Number.isFinite(userLon);
    const nearestCandidate = hasUsableUserCoordinates && coordinateCandidates.length > 0
        ? coordinateCandidates.reduce((nearest, candidate) => (haversineDistance(userLat, userLon, candidate.lat, candidate.lon)
            < haversineDistance(userLat, userLon, nearest.lat, nearest.lon)
            ? candidate
            : nearest))
        : null;
    const jobLat = nearestCandidate?.lat ?? primaryJobLat;
    const jobLon = nearestCandidate?.lon ?? primaryJobLon;
    const scoringLocation = nearestCandidate?.label ?? textMatchedLocation;
    const matchedLocation = listedLocations.length > 1 ? scoringLocation : null;
    const locationFallback = getLocationFallback(job) || null;
    const userCountry = detectCountryFromLocation(locationText);
    const jobCountry = detectJobCountry(job, scoringLocation, isPurelyRemoteJob(job) ? userCountry : null);
    const countriesDiffer = userCountry !== null && jobCountry !== null && userCountry !== jobCountry;
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
    };
    if (hasUnknownLocationAndRemote(job)) {
        if (shouldLog) {
            console.log(`Location score hard-zero for job "${job.name}": location and remote are both unknown`);
        }
        return {
            ...base,
            locationScore: 0,
            calculation: 'Location and remote are both unknown: score = 0.0000.',
        };
    }
    if (isPurelyRemoteJob(job)) {
        if (countriesDiffer) {
            if (shouldLog) {
                console.log(`Location score override for remote different-country job "${job.name}": 0.4000`);
            }
            return {
                ...base,
                locationScore: 0.4,
                calculation: `Remote job country (${jobCountry}) differs from user country (${userCountry}): score = 04000.`,
            };
        }
        if (isRemoteWithNoCountryAttached(job)) {
            if (shouldLog) {
                console.log(`Location score override for remote unknown-country job "${job.name}": 0.9500`);
            }
            return { ...base, locationScore: 0.95, calculation: 'Remote job without a country: score = 0.9500; geographic distance not used.' };
        }
        if (shouldLog) {
            console.log(`Location score override for remote same-country job "${job.name}": 1.0000`);
        }
        const countryDetail = userCountry !== null && jobCountry !== null
            ? ` Both are in ${userCountry}.`
            : ' No different-country restriction was detected.';
        return { ...base, locationScore: 1, calculation: `Remote-job override: score = 1.0000; geographic distance not used.${countryDetail}` };
    }
    const effectiveJobLocation = getEffectiveJobLocation(job);
    if (!effectiveJobLocation && !isRemoteJob(job)) {
        if (shouldLog) {
            console.log(`Location score hard-zero for non-remote job "${job.name}": location is unknown`);
        }
        return { ...base, locationScore: 0, calculation: 'Non-remote job has an unknown location: score = 0.0000.' };
    }
    let distanceScore = 0;
    let calculation = 'No usable coordinates or location-text match: score = 0.0000.';
    const normalizedJobLocation = toSafeText(effectiveJobLocation);
    const normalizedJobDescription = toSafeText(job.description);
    const hasUsableCoordinates = userLat !== null
        && userLon !== null
        && Number.isFinite(userLat)
        && Number.isFinite(userLon)
        && jobLat !== null
        && jobLon !== null;
    if (hasUsableCoordinates) {
        if (shouldLog) {
            console.log(`Calculating location score for job "${job.name}" at "${job.location}" with user location "${locationText} ${userLat}, ${userLon} job.location_lat: ${jobLat} job.location_lon: ${jobLon}"`);
        }
        const latDelta = Math.abs(jobLat - userLat);
        const rawLonDelta = Math.abs(jobLon - userLon);
        const lonDelta = Math.min(rawLonDelta, 340 - rawLonDelta);
        if (latDelta >= 100 || lonDelta >= 100) {
            if (shouldLog) {
                console.log(`Location score hard-zero for job "${job.name}": lat delta ${latDelta.toFixed(2)}° lon delta ${lonDelta.toFixed(2)}° (wrap-adjusted) exceed 100° threshold`);
            }
            return {
                ...base,
                locationScore: 0,
                calculation: `Coordinate sanity check: latitude delta ${latDelta.toFixed(2)}°, longitude delta ${lonDelta.toFixed(2)}°; delta >= 100°, so score = 0.0000.`,
            };
        }
        const distanceKm = haversineDistance(userLat, userLon, jobLat, jobLon);
        const distanceMiles = distanceKm * 0.621371;
        distanceScore = Math.max(0, Math.min(1, (100 - Math.sqrt(distanceKm)) / 100));
        const nearestDetail = matchedLocation ? ` Nearest listed job location: ${matchedLocation}.` : '';
        calculation = `Haversine great-circle distance (Earth radius 6,371 km); score = clamp((100 - sqrt(${distanceKm.toFixed(2)} km)) / 100, 0, 1) = ${distanceScore.toFixed(4)}.${nearestDetail}`;
        if (countriesDiffer) {
            distanceScore *= 0.5;
            calculation += ` Job country (${jobCountry}) differs from user country (${userCountry}), so score is cut by 50% to ${distanceScore.toFixed(4)}.`;
        }
        if (shouldLog) {
            console.log(`Calculated distance for job "${job.name}" at "${job.location}": ${distanceKm.toFixed(2)} km -> distanceScore: ${distanceScore.toFixed(4)}`);
        }
        return { ...base, distanceKm, distanceMiles, locationScore: distanceScore, calculation };
    }
    if (normalizedUserLocationText.length > 0) {
        if (textMatchedLocation) {
            distanceScore = 0.4;
            calculation = `Coordinate lookup unavailable; listed location "${textMatchedLocation}" matches the user location, giving score = 0.4000.`;
        }
        else if (normalizedJobLocation.includes(normalizedUserLocationText) ||
            normalizedUserLocationText.includes(normalizedJobLocation)) {
            distanceScore = 0.4;
            calculation = 'Coordinate lookup unavailable; full location-text overlap gives score = 0.4000.';
        }
        else {
            const userLocationTerms = normalizedUserLocationText.split(/\s+/).filter((term) => term.length >= 3);
            const hitCount = userLocationTerms.filter((term) => normalizedJobLocation.includes(term) || normalizedJobDescription.includes(term)).length;
            if (hitCount > 0 && userLocationTerms.length > 0) {
                distanceScore = Math.min(0.5, hitCount / userLocationTerms.length);
                calculation = `Coordinate lookup unavailable; ${hitCount}/${userLocationTerms.length} location terms matched, capped at 0.5000, giving score = ${distanceScore.toFixed(4)}.`;
            }
            else {
                calculation = 'Coordinate lookup unavailable and no location terms matched: score = 0.0000.';
            }
        }
    }
    if (countriesDiffer) {
        distanceScore *= 0.5;
        calculation += ` Job country (${jobCountry}) differs from user country (${userCountry}), so score is cut by 50% to ${distanceScore.toFixed(4)}.`;
    }
    if (shouldLog) {
        console.log(`Final location score for job "${job.name}" at "${job.location}": ${distanceScore.toFixed(4)}`);
    }
    return { ...base, matchedLocation, locationScore: distanceScore, calculation };
}
export function getLocationScoreDebugInfo(userLat, userLon, job, locationText) {
    return buildLocationScoreDebugInfo(userLat, userLon, job, locationText, false);
}
/**
 * Calculates the location score based on geographic distance and remote status
 *
 * Score is normalized to 0-1 range:
 * - Remote jobs use an override score
 * - Jobs with coordinates use Haversine distance
 * - Jobs without coordinates fall back to location-text matching
 *
 * @param userLat - User's latitude (or null if not available)
 * @param userLon - User's longitude (or null if not available)
 * @param job - The job being scored
 * @param locationText - User's location text input (checked for "remote" keyword)
 * @returns Location score between 0 and 1
 */
export function calculateLocationScore(userLat, userLon, job, locationText, shouldLog = false) {
    return buildLocationScoreDebugInfo(userLat, userLon, job, locationText, shouldLog).locationScore;
}
/**
 * Geocodes the user's location text to latitude/longitude coordinates
 *
 * @param locationText - User's location text (city, region, etc.)
 * @returns Object with lat/lon, or null if geocoding fails or text is empty
 */
export async function geocodeUserLocation(locationText, shouldLog = false) {
    if (locationText.trim().length === 0) {
        return null;
    }
    // Race the real geocoder against a 5-second timeout.
    // If the geocoder wins → use its result (it also self-caches to disk).
    // If the timeout wins → use the city fallback table as a temporary
    // substitute for this search only (NOT cached to disk).
    const GEOCODE_TIMEOUT_MS = 5000;
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('timeout'), GEOCODE_TIMEOUT_MS));
    try {
        const geoLabel = `geocode:userLocation "${locationText}"`;
        setActiveOperation(geoLabel);
        const result = await Promise.race([nameToLonLat(locationText), timeoutPromise]);
        clearActiveOperation(geoLabel);
        if (result === 'timeout') {
            // Primary geocoder stalled — try city fallback without caching
            const fallback = lookupCityFallback(locationText);
            if (fallback) {
                if (shouldLog) {
                    console.warn(`[geocodeUserLocation] Geocoder timed out for "${locationText}", using city fallback: ${JSON.stringify(fallback)}`);
                }
                return fallback;
            }
            console.warn(`[geocodeUserLocation] Geocoder timed out for "${locationText}" and no city fallback found`);
            return null;
        }
        if (shouldLog) {
            console.log('Geocoding user location:', locationText, '->', result);
        }
        return { lat: result.lat, lon: result.lon };
    }
    catch (e) {
        // Geocoder threw — try city fallback without caching
        const fallback = lookupCityFallback(locationText);
        if (fallback) {
            if (shouldLog) {
                console.warn(`[geocodeUserLocation] Geocoder failed for "${locationText}", using city fallback: ${JSON.stringify(fallback)}`);
            }
            return fallback;
        }
        return null;
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
export async function geocodeJobLocations(jobs, shouldLog = false) {
    const inFlightByLocation = new Map();
    const hasValidCoords = (job) => {
        const { location_lat: lat, location_lon: lon } = job;
        return typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);
    };
    const hasAllLocationCoordinates = (job) => {
        const locations = getJobLocations(job);
        return locations.length <= 1 || (Array.isArray(job.location_coordinates)
            && job.location_coordinates.length === locations.length
            && job.location_coordinates.every((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon)));
    };
    const shouldSkipGeocodeForJob = (job) => {
        const effectiveLocation = getEffectiveJobLocation(job);
        if (!effectiveLocation) {
            return true;
        }
        // Remote/generic locations do not benefit from geocoding and often create noisy lookups.
        if (isPurelyRemoteJob(job)) {
            return true;
        }
        return false;
    };
    // Filter to only jobs that actually need geocoding — avoids creating async
    // closures for the (majority of) jobs that already have valid coordinates.
    setActiveOperation(`geocode:filterNeeding (${jobs.length} jobs)`);
    const jobsNeedingGeocode = jobs.filter((job) => (!hasValidCoords(job) || !hasAllLocationCoordinates(job)) && !shouldSkipGeocodeForJob(job));
    clearActiveOperation('geocode:filterNeeding');
    if (jobsNeedingGeocode.length === 0) {
        return jobs;
    }
    setActiveOperation(`geocode:lookupLocations (${jobsNeedingGeocode.length} jobs)`);
    await Promise.all(jobsNeedingGeocode.map(async (job) => {
        const locations = getJobLocations(job);
        const resolvedLocations = await Promise.all(locations.map(async (location) => {
            const locationKey = normalizeLocationName(location);
            try {
                if (!inFlightByLocation.has(locationKey)) {
                    inFlightByLocation.set(locationKey, nameToLonLat(location));
                }
                const coordinates = await inFlightByLocation.get(locationKey);
                return { label: location, lat: coordinates.lat, lon: coordinates.lon };
            }
            catch {
                return null;
            }
        }));
        const validLocations = resolvedLocations.filter((location) => location !== null);
        if (validLocations.length > 0) {
            job.location_lat = validLocations[0].lat;
            job.location_lon = validLocations[0].lon;
            job.location_coordinates = locations.length > 1 ? validLocations : undefined;
        }
        else {
            job.location_lat = NaN;
            job.location_lon = NaN;
            job.location_coordinates = undefined;
        }
    }));
    clearActiveOperation('geocode:lookupLocations');
    return jobs;
}
