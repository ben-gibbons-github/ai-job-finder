import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CacheHandler } from '../utils/CacheHandler.js'

export interface CachedLocationOption {
  value: string
  label: string
  country?: string
  state?: string
  displayLabel: string
  lat: number
  lng: number
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CACHE_FILE_PATH = path.resolve(__dirname, '../../cache/locationsearch.json')
const cacheHandler = new CacheHandler(CACHE_FILE_PATH)

type LocationSearchCacheStore = Record<string, CachedLocationOption[]>

const locationSearchCache = new Map<string, CachedLocationOption[]>()
let loadPromise: Promise<void> | null = null

async function ensureCacheLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    try {
      const parsed = await cacheHandler.loadWithFallback((raw) => JSON.parse(raw) as unknown)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return
      }

      const asRecord = parsed as LocationSearchCacheStore
      for (const [query, results] of Object.entries(asRecord)) {
        if (!query || !Array.isArray(results)) {
          continue
        }

        const filtered = results.filter((item) => {
          return (
            item &&
            typeof item.value === 'string' &&
            typeof item.label === 'string' &&
            typeof item.displayLabel === 'string' &&
            Number.isFinite(item.lat) &&
            Number.isFinite(item.lng)
          )
        })

        if (filtered.length > 0) {
          locationSearchCache.set(query, filtered)
        }
      }
    } catch {
      // No cache file yet or invalid JSON; start with empty in-memory cache.
    }
  })()

  return loadPromise
}

async function persistCacheToDisk(): Promise<void> {
  const payload: LocationSearchCacheStore = Object.fromEntries(locationSearchCache)
  await cacheHandler.save(JSON.stringify(payload, null, 2)).catch(() => undefined)
  console.trace("persistCacheToDisk:: stack trace");
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
  await persistCacheToDisk()
}
