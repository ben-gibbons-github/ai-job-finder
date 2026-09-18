import axios from 'axios'
import type { LocationOption, ParsedPostalQuery } from './types.js'
import { LOCATION_RESULT_LIMIT, REQUEST_TIMEOUT_MS, toLocationOption } from './utils.js'

export async function fetchFromOpenStreetMap(query: string): Promise<LocationOption[]> {
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
  })

  const rawResults = Array.isArray(response.data) ? response.data : []
  return rawResults
    .map((item: any): LocationOption | null => {
      const city =
        item?.address?.city ||
        item?.address?.town ||
        item?.address?.village ||
        item?.address?.hamlet ||
        item?.name ||
        String(item?.display_name || '').split(',')[0]

      const state = item?.address?.state
      const country = item?.address?.country
      const lat = Number.parseFloat(item?.lat)
      const lng = Number.parseFloat(item?.lon)

      if (!city || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null
      }

      return toLocationOption({ city, state, country, lat, lng })
    })
    .filter((item: LocationOption | null): item is LocationOption => item !== null)
}

export async function fetchFromOpenMeteo(query: string): Promise<LocationOption[]> {
  const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
    params: {
      name: query,
      count: LOCATION_RESULT_LIMIT,
      language: 'en',
      format: 'json',
    },
    timeout: REQUEST_TIMEOUT_MS,
  })

  const rawResults = Array.isArray(response.data?.results) ? response.data.results : []
  return rawResults
    .map((item: any): LocationOption | null => {
      const city = String(item?.name ?? '').trim()
      const state = String(item?.admin1 ?? '').trim() || undefined
      const country = String(item?.country ?? '').trim() || undefined
      const lat = Number(item?.latitude)
      const lng = Number(item?.longitude)

      if (!city || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null
      }

      return toLocationOption({ city, state, country, lat, lng })
    })
    .filter((item: LocationOption | null): item is LocationOption => item !== null)
}

export async function fetchFromZippopotam(postalQuery: ParsedPostalQuery): Promise<LocationOption[]> {
  const response = await axios.get(
    `https://api.zippopotam.us/${encodeURIComponent(postalQuery.countryCode.toLowerCase())}/${encodeURIComponent(postalQuery.postalCode)}`,
    {
      timeout: REQUEST_TIMEOUT_MS,
    }
  )

  const places = Array.isArray(response.data?.places) ? response.data.places : []
  const country = String(response.data?.country ?? postalQuery.countryCode).trim()
  return places
    .map((place: any): LocationOption | null => {
      const city = String(place?.['place name'] ?? '').trim()
      const state =
        String(place?.state ?? '').trim() ||
        String(place?.['state abbreviation'] ?? '').trim() ||
        undefined
      const lat = Number.parseFloat(place?.latitude)
      const lng = Number.parseFloat(place?.longitude)

      if (!city || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null
      }

      return toLocationOption({ city, state, country, lat, lng })
    })
    .filter((item: LocationOption | null): item is LocationOption => item !== null)
}
