import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CACHE_DB_FILE,
  readAllLocationSearchCacheRows,
  replaceLocationSearchCacheRows,
} from '../../database/CacheDatabase.js'
import {
  recordDatabaseRead,
  recordDatabaseWrite,
  recordHybridCacheFlow,
  registerDatabasePath,
} from '../../utils/CacheIoTelemetry.js'
import { decodeLegacyCachePayload } from '../../utils/LegacyCacheDecode.js'
import type { LocationOption } from './types.js'
import { locationSearchCache } from './cacheState.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const CACHE_FILE_PATH = path.resolve(__dirname, '../../../cache/locationsearch.json')
registerDatabasePath(CACHE_FILE_PATH, 'sqlite', CACHE_DB_FILE)

export async function hydrateCacheFromDbOrLegacyFile(): Promise<void> {
  try {
    const dbRows = readAllLocationSearchCacheRows()
    if (dbRows.length > 0) {
      recordDatabaseRead(CACHE_FILE_PATH, true)
      recordHybridCacheFlow(CACHE_FILE_PATH, 'db-read-hit')
      for (const row of dbRows) {
        if (!row.queryKey) {
          continue
        }

        const existing = locationSearchCache.get(row.queryKey) ?? []
        existing.push({
          value: row.value,
          label: row.label,
          country: row.country || undefined,
          state: row.state || undefined,
          displayLabel: row.displayLabel,
          lat: row.lat,
          lng: row.lng,
        })
        locationSearchCache.set(row.queryKey, existing)
      }
      return
    }

    recordDatabaseRead(CACHE_FILE_PATH, false)
    recordHybridCacheFlow(CACHE_FILE_PATH, 'db-read-miss')

    const raw = await fs.readFile(CACHE_FILE_PATH, 'utf8')
    const parsed = JSON.parse(decodeLegacyCachePayload(raw)) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return
    }

    const asRecord = parsed as Record<string, LocationOption[]>
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
        replaceLocationSearchCacheRows(
          query,
          filtered.map((item, index) => ({
            resultIndex: index,
            value: item.value,
            label: item.label,
            country: item.country ?? '',
            state: item.state ?? '',
            displayLabel: item.displayLabel,
            lat: item.lat,
            lng: item.lng,
          })),
        )
      }
    }

    if (locationSearchCache.size > 0) {
      recordDatabaseWrite(CACHE_FILE_PATH)
      recordHybridCacheFlow(CACHE_FILE_PATH, 'legacy-read-hit')
      recordHybridCacheFlow(CACHE_FILE_PATH, 'db-hydrate-write')
    }
  } catch {
    // No cache file yet or invalid JSON; start with empty in-memory cache.
  }
}

export async function persistCacheToDatabase(): Promise<void> {
  for (const [query, results] of locationSearchCache.entries()) {
    replaceLocationSearchCacheRows(
      query,
      results.map((item, index) => ({
        resultIndex: index,
        value: item.value,
        label: item.label,
        country: item.country ?? '',
        state: item.state ?? '',
        displayLabel: item.displayLabel,
        lat: item.lat,
        lng: item.lng,
      })),
    )
  }

  recordDatabaseWrite(CACHE_FILE_PATH)
  recordHybridCacheFlow(CACHE_FILE_PATH, 'db-direct-write')
}
