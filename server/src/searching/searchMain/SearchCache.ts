import type { RankedJobWrapper, SearchPayload, SearchResultMeta } from '../SearchInterfaces.js'
import { createCacheHitMeta } from './meta.js'

const SEARCH_CACHE_MAX_ENTRIES = 10

export interface CachedSearch {
  wrappers: RankedJobWrapper[]
  size: number
  /** Meta without debugInfo — timing data is per-search and should not be cached */
  meta: Omit<SearchResultMeta, 'debugInfo'>
}

export interface CachedSearchLookupResult {
  matched: RankedJobWrapper[]
  size: number
  meta: SearchResultMeta
  hitMs: number
}

export default class SearchCache {
  private readonly searchCache = new Map<string, CachedSearch>()
  private searchCacheGeneration = 0

  get generation(): number {
    return this.searchCacheGeneration
  }

  clear(): void {
    this.searchCache.clear()
    this.searchCacheGeneration += 1
  }

  get(fingerprint: string): CachedSearch | undefined {
    const entry = this.searchCache.get(fingerprint)
    if (entry !== undefined) {
      // Move to end (most-recently-used)
      this.searchCache.delete(fingerprint)
      this.searchCache.set(fingerprint, entry)
    }
    return entry
  }

  getLookupResult(
    fingerprint: string,
    searchPayload: SearchPayload,
    debugEnabled: boolean,
    rawQuery: string,
    searchStart: number,
  ): CachedSearchLookupResult | null {
    const cached = this.get(fingerprint)
    if (cached === undefined) {
      return null
    }

    const hitMs = Number((performance.now() - searchStart).toFixed(2))
    const start = Number.isInteger(searchPayload.start) ? Number(searchPayload.start) : 0
    const end = Number.isInteger(searchPayload.end) ? Number(searchPayload.end) : cached.size
    const sliced = (start < 0 || end < 0 || end <= start)
      ? cached.wrappers
      : cached.wrappers.slice(start, end)
    const meta = createCacheHitMeta({
      cachedMeta: cached.meta,
      cachedSize: cached.size,
      hitMs,
      debugEnabled,
      locationText: String(searchPayload.locationText ?? ''),
      query: rawQuery,
      userRatingMode: String(searchPayload.userRatingMode ?? 'none'),
    })

    return {
      matched: sliced,
      size: cached.size,
      meta,
      hitMs,
    }
  }

  set(fingerprint: string, result: CachedSearch): void {
    if (this.searchCache.has(fingerprint)) {
      this.searchCache.delete(fingerprint)
    } else if (this.searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
      // Evict least-recently-used (first key in insertion-ordered Map)
      const lruKey = this.searchCache.keys().next().value
      if (lruKey !== undefined) {
        this.searchCache.delete(lruKey)
      }
    }

    this.searchCache.set(fingerprint, result)
  }
}
