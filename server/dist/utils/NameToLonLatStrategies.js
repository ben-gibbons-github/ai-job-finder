import axios from 'axios';
import { HARDCODED_LOCATIONS } from './HardcodedLocations.js';
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY ?? '';
const MAPQUEST_API_KEY = process.env.MAPQUEST_API_KEY ?? '';
/**
 * Geocoding API strategies for location lookup
 * Each strategy is an async function that attempts to geocode a location
 */
/**
 * Normalize location text for matching against hardcoded database
 */
function normalizeLocationText(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Strip accents/diacritics (e.g. Zürich -> zurich)
        .toLowerCase()
        .replace(/,.*$/g, '') // Remove everything after comma (state/country)
        .replace(/[^a-z0-9\s-]/g, ' ') // Drop punctuation/symbols
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}
const NORMALIZED_HARDCODED_LOCATIONS = Object.entries(HARDCODED_LOCATIONS).reduce((acc, [key, value]) => {
    acc[normalizeLocationText(key)] = value;
    return acc;
}, {});
/**
 * 1. OpenStreetMap Nominatim - Free, reliable, no API key required
 */
export async function nominatimStrategy(placeName) {
    // console.log('[Nominatim] Attempting to geocode:', placeName)
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
            q: placeName,
            format: 'json',
            limit: 1,
        },
        headers: {
            'User-Agent': 'JobFinder/1.0',
        },
    });
    if (!response.data || response.data.length === 0) {
        // console.log('[Nominatim] No results found for:', placeName)
        throw new Error(`No results found for location: ${placeName}`);
    }
    const result = response.data[0];
    const latLon = {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
    };
    // console.log('[Nominatim] Success for', placeName, '-> ', latLon)
    return latLon;
}
/**
 * 2. Geoapify - Free tier available, good coverage
 * Note: Demo key provided; replace with your own for production
 */
export async function geoapifyStrategy(placeName) {
    if (!GEOAPIFY_API_KEY) {
        throw new Error('Missing GEOAPIFY_API_KEY');
    }
    // console.log('[Geoapify] Attempting to geocode:', placeName)
    const response = await axios.get('https://api.geoapify.com/v1/geocode/search', {
        params: {
            text: placeName,
            format: 'json',
            apiKey: GEOAPIFY_API_KEY,
            limit: 1,
        },
    });
    const featureCoords = response.data?.features?.[0]?.geometry?.coordinates;
    const resultObj = response.data?.results?.[0];
    if (!featureCoords && (!resultObj || typeof resultObj.lat !== 'number' || typeof resultObj.lon !== 'number')) {
        // console.log('[Geoapify] No results found for:', placeName)
        throw new Error(`No results found for location: ${placeName}`);
    }
    const latLon = {
        lon: featureCoords ? featureCoords[0] : resultObj.lon,
        lat: featureCoords ? featureCoords[1] : resultObj.lat,
    };
    // console.log('[Geoapify] Success for', placeName, '-> ', latLon)
    return latLon;
}
/**
 * 3. Open-Meteo Geocoding - Free, no API key required
 */
export async function openMeteoStrategy(placeName) {
    // console.log('[OpenMeteo] Attempting to geocode:', placeName)
    const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
            name: placeName,
            count: 1,
            language: 'en',
            format: 'json',
        },
    });
    if (!response.data || !response.data.results || response.data.results.length === 0) {
        // console.log('[OpenMeteo] No results found for:', placeName)
        throw new Error(`No results found for location: ${placeName}`);
    }
    const result = response.data.results[0];
    const latLon = {
        lat: result.latitude,
        lon: result.longitude,
    };
    // console.log('[OpenMeteo] Success for', placeName, '-> ', latLon)
    return latLon;
}
/**
 * 4. MapQuest Nominatim - Requires MAPQUEST_API_KEY env var
 */
export async function mapquestStrategy(placeName) {
    if (!MAPQUEST_API_KEY) {
        throw new Error('Missing MAPQUEST_API_KEY');
    }
    // console.log('[MapQuest] Attempting to geocode:', placeName)
    const response = await axios.get('https://www.mapquestapi.com/geocoding/v1/address', {
        params: {
            key: MAPQUEST_API_KEY,
            location: placeName,
            maxResults: 1,
        },
    });
    if (!response.data ||
        !response.data.results ||
        response.data.results.length === 0 ||
        !response.data.results[0].locations ||
        response.data.results[0].locations.length === 0) {
        // console.log('[MapQuest] No results found for:', placeName)
        throw new Error(`No results found for location: ${placeName}`);
    }
    const loc = response.data.results[0].locations[0].latLng;
    const latLon = {
        lat: loc.lat,
        lon: loc.lng,
    };
    // console.log('[MapQuest] Success for', placeName, '-> ', latLon)
    return latLon;
}
/**
 * 5. BigDataCloud - Free tier available, no API key required for basic usage
 */
export async function bigdatacloudStrategy(placeName) {
    // console.log('[BigDataCloud] Attempting to geocode:', placeName)
    const response = await axios.get('https://api.bigdatacloud.net/data/reverse-geocode-client', {
        params: {
            localityLanguage: 'en',
            location: placeName,
        },
    });
    if (!response.data || !response.data.latitude || !response.data.longitude) {
        console.log('[BigDataCloud] No results found for:', placeName);
        throw new Error(`No results found for location: ${placeName}`);
    }
    const latLon = {
        lat: response.data.latitude,
        lon: response.data.longitude,
    };
    console.log('[BigDataCloud] Success for', placeName, '-> ', latLon);
    return latLon;
}
/**
 * 6. Hardcoded Locations Fallback - Last resort strategy
 * Uses a hardcoded database of common locations when all APIs fail
 * Results are marked as less accurate with isHardcoded=true
 */
export async function hardcodedLocationsStrategy(placeName) {
    // console.log('[Hardcoded] Attempting to match against hardcoded locations:', placeName)
    const normalized = normalizeLocationText(placeName);
    // Try exact match first
    if (NORMALIZED_HARDCODED_LOCATIONS[normalized]) {
        const result = NORMALIZED_HARDCODED_LOCATIONS[normalized];
        // console.log('[Hardcoded] Found match for', placeName, '-> ', result, '(NOTE: This is a hardcoded fallback, less accurate)')
        return result;
    }
    // console.log('[Hardcoded] No match found for:', placeName)
    throw new Error(`No hardcoded location match found for: ${placeName}`);
}
/**
 * Array of all geocoding strategies in order of preference
 */
export const geocodingStrategies = [
    nominatimStrategy,
    geoapifyStrategy,
    openMeteoStrategy,
    mapquestStrategy,
    hardcodedLocationsStrategy, // Fallback to hardcoded locations when all APIs fail
];
