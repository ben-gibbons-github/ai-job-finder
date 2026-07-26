import axios from 'axios';
import { getCachedLocationSearch, setCachedLocationSearch } from './LocationSearchCache.js';
const LOCATION_RESULT_LIMIT = 8;
const REQUEST_TIMEOUT_MS = 5000;
function toLocationOption(parts) {
    const city = String(parts.city ?? '').trim();
    const state = String(parts.state ?? '').trim() || undefined;
    const country = String(parts.country ?? '').trim() || undefined;
    const lat = Number(parts.lat);
    const lng = Number(parts.lng);
    return {
        value: `${city}|${lat}|${lng}`,
        label: city,
        country,
        state,
        displayLabel: [city, state, country].filter(Boolean).join(', '),
        lat,
        lng,
    };
}
function dedupeAndLimit(options, limit = LOCATION_RESULT_LIMIT) {
    const deduped = [];
    const seen = new Set();
    for (const option of options) {
        const key = `${option.displayLabel.toLowerCase()}|${option.lat.toFixed(4)}|${option.lng.toFixed(4)}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(option);
        if (deduped.length >= limit) {
            break;
        }
    }
    return deduped;
}
function parsePostalQuery(query) {
    const trimmed = query.trim().toUpperCase();
    if (!trimmed) {
        return null;
    }
    const usZip = /^(\d{5})(?:-\d{4})?$/;
    if (usZip.test(trimmed)) {
        return { countryCode: 'US', postalCode: trimmed };
    }
    const prefixCountry = trimmed.match(/^([A-Z]{2})[\s-]+([A-Z0-9][A-Z0-9\s-]{1,9})$/);
    if (prefixCountry) {
        return { countryCode: prefixCountry[1], postalCode: prefixCountry[2].trim() };
    }
    const suffixCountry = trimmed.match(/^([A-Z0-9][A-Z0-9\s-]{1,9})[\s,]+([A-Z]{2})$/);
    if (suffixCountry) {
        return { countryCode: suffixCountry[2], postalCode: suffixCountry[1].trim() };
    }
    return null;
}
async function fetchFromOpenStreetMap(query) {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
            q: query,
            format: 'jsonv2',
            addressdetails: 1,
            limit: LOCATION_RESULT_LIMIT,
        },
        headers: {
            'User-Agent': 'JobFinder/1.0 (location-autocomplete)',
        },
        timeout: REQUEST_TIMEOUT_MS,
    });
    const rawResults = Array.isArray(response.data) ? response.data : [];
    return rawResults
        .map((item) => {
        const city = item?.address?.city ||
            item?.address?.town ||
            item?.address?.village ||
            item?.address?.hamlet ||
            item?.name ||
            String(item?.display_name || '').split(',')[0];
        const state = item?.address?.state;
        const country = item?.address?.country;
        const lat = Number.parseFloat(item?.lat);
        const lng = Number.parseFloat(item?.lon);
        if (!city || Number.isNaN(lat) || Number.isNaN(lng)) {
            return null;
        }
        return toLocationOption({ city, state, country, lat, lng });
    })
        .filter((item) => item !== null);
}
async function fetchFromOpenMeteo(query) {
    const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
            name: query,
            count: LOCATION_RESULT_LIMIT,
            language: 'en',
            format: 'json',
        },
        timeout: REQUEST_TIMEOUT_MS,
    });
    const rawResults = Array.isArray(response.data?.results) ? response.data.results : [];
    return rawResults
        .map((item) => {
        const city = String(item?.name ?? '').trim();
        const state = String(item?.admin1 ?? '').trim() || undefined;
        const country = String(item?.country ?? '').trim() || undefined;
        const lat = Number(item?.latitude);
        const lng = Number(item?.longitude);
        if (!city || Number.isNaN(lat) || Number.isNaN(lng)) {
            return null;
        }
        return toLocationOption({ city, state, country, lat, lng });
    })
        .filter((item) => item !== null);
}
async function fetchFromZippopotam(postalQuery) {
    const response = await axios.get(`https://api.zippopotam.us/${encodeURIComponent(postalQuery.countryCode.toLowerCase())}/${encodeURIComponent(postalQuery.postalCode)}`, {
        timeout: REQUEST_TIMEOUT_MS,
    });
    const places = Array.isArray(response.data?.places) ? response.data.places : [];
    const country = String(response.data?.country ?? postalQuery.countryCode).trim();
    return places
        .map((place) => {
        const city = String(place?.['place name'] ?? '').trim();
        const state = String(place?.state ?? '').trim() ||
            String(place?.['state abbreviation'] ?? '').trim() ||
            undefined;
        const lat = Number.parseFloat(place?.latitude);
        const lng = Number.parseFloat(place?.longitude);
        if (!city || Number.isNaN(lat) || Number.isNaN(lng)) {
            return null;
        }
        return toLocationOption({ city, state, country, lat, lng });
    })
        .filter((item) => item !== null);
}
export async function searchLocationsOpenStreetMap(query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2) {
        return [];
    }
    const cached = await getCachedLocationSearch(normalizedQuery);
    if (cached) {
        return cached;
    }
    const providers = [];
    const postalQuery = parsePostalQuery(query);
    if (postalQuery) {
        providers.push(fetchFromZippopotam(postalQuery).catch(() => []));
    }
    providers.push(fetchFromOpenStreetMap(query).catch(() => []));
    providers.push(fetchFromOpenMeteo(query).catch(() => []));
    const providerResults = await Promise.all(providers);
    const merged = providerResults.flat();
    const deduped = dedupeAndLimit(merged, LOCATION_RESULT_LIMIT);
    if (deduped.length > 0) {
        await setCachedLocationSearch(normalizedQuery, deduped);
    }
    return deduped;
}
