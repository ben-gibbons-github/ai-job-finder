import { hydrateCacheFromDbOrLegacyFile, persistCacheToDatabase } from './cacheStorage.js'
import { loadPromise, locationSearchCache, setLoadPromise } from './cacheState.js'
import type { LocationOption } from './types.js'

export type CachedLocationOption = LocationOption

async function ensureCacheLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise
  }

  const nextLoad = hydrateCacheFromDbOrLegacyFile()
  setLoadPromise(nextLoad)
  return nextLoad
}

export async function getCachedLocationSearch(query: string): Promise<CachedLocationOption[] | null> {
  await ensureCacheLoaded()
  return locationSearchCache.get(query) ?? null
}

export async function setCachedLocationSearch(
  query: string,
  results: CachedLocationOption[]
): Promise<void> {
  if (!query || results.length === 0) {
    return
  }

  await ensureCacheLoaded()
  locationSearchCache.set(query, results)
  await persistCacheToDatabase()
}

export async function warmLocationSearchCache(): Promise<number> {
  await ensureCacheLoaded()
  return locationSearchCache.size
}
