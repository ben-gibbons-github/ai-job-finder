import type { LocationOption } from './types.js'

export const LOCATION_RESULT_LIMIT = 8
export const REQUEST_TIMEOUT_MS = 5000

export function toLocationOption(parts: {
  city: string
  state?: string
  country?: string
  lat: number
  lng: number
}): LocationOption {
  const city = String(parts.city ?? '').trim()
  const state = String(parts.state ?? '').trim() || undefined
  const country = String(parts.country ?? '').trim() || undefined
  const lat = Number(parts.lat)
  const lng = Number(parts.lng)

  return {
    value: `${city}|${lat}|${lng}`,
    label: city,
    country,
    state,
    displayLabel: [city, state, country].filter(Boolean).join(', '),
    lat,
    lng,
  }
}

export function dedupeAndLimit(options: LocationOption[], limit = LOCATION_RESULT_LIMIT): LocationOption[] {
  const deduped: LocationOption[] = []
  const seen = new Set<string>()

  for (const option of options) {
    const key = `${option.displayLabel.toLowerCase()}|${option.lat.toFixed(4)}|${option.lng.toFixed(4)}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(option)
    if (deduped.length >= limit) {
      break
    }
  }

  return deduped
}
