import { getCachedLocationSearch, setCachedLocationSearch } from './LocationSearchCache.js'
import { parsePostalQuery } from './postal.js'
import { fetchFromOpenMeteo, fetchFromOpenStreetMap, fetchFromZippopotam } from './providers.js'
import type { LocationOption } from './types.js'
import { dedupeAndLimit, LOCATION_RESULT_LIMIT } from './utils.js'

export type { LocationOption } from './types.js'

export async function searchLocationsOpenStreetMap(query: string): Promise<LocationOption[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length < 2) {
    return []
  }

  const cached = await getCachedLocationSearch(normalizedQuery)
  if (cached) {
    return cached
  }

  const providers: Promise<LocationOption[]>[] = []
  const postalQuery = parsePostalQuery(query)

  if (postalQuery) {
    providers.push(fetchFromZippopotam(postalQuery).catch(() => []))
  }

  providers.push(fetchFromOpenStreetMap(query).catch(() => []))
  providers.push(fetchFromOpenMeteo(query).catch(() => []))

  const providerResults = await Promise.all(providers)
  const merged = providerResults.flat()
  const deduped = dedupeAndLimit(merged, LOCATION_RESULT_LIMIT)

  if (deduped.length > 0) {
    await setCachedLocationSearch(normalizedQuery, deduped)
  }

  return deduped
}
