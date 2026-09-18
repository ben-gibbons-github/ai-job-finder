import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CACHE_DB_FILE,
  deleteLocationLatLonCacheRow,
  readAllLocationLatLonCacheRows,
  upsertLocationLatLonCacheRow,
} from '../database/CacheDatabase.js';
import {
  recordDatabaseRead,
  recordDatabaseWrite,
  recordHybridCacheFlow,
  registerDatabasePath,
} from './CacheIoTelemetry.js';
import { decodeLegacyCachePayload } from './LegacyCacheDecode.js';
import { logBackgroundTaskEnd, logBackgroundTaskStart } from './BackgroundTaskTiming.js';

export interface LatLonPair {
  lat: number;
  lon: number;
  isHardcoded?: boolean; // Flag to indicate if this is from hardcoded fallback (less accurate)
}

const EVICT_HARDCODED_CACHE_VALUES = String(process.env.EVICT_HARDCODED_CACHE_VALUES ?? '').toLowerCase() === 'true'
const SKIP_LOCATION_CACHE_LOAD = String(process.env.SKIP_LOCATION_CACHE_LOAD ?? '').toLowerCase() === 'true'

// Global cache for storing location name -> lat/lon mappings
const locationCache: Map<string, LatLonPair> = new Map();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const cacheFilePath = path.resolve(moduleDir, '../../cache/locations.json');
registerDatabasePath(cacheFilePath, 'sqlite', CACHE_DB_FILE)

let cacheLoadPromise: Promise<void> | null = null;
const CACHE_WRITE_DEBOUNCE_MS = 250;
let cacheWriteTimer: ReturnType<typeof setTimeout> | null = null;
let cacheWriteInFlight = false;
let cacheWriteQueuedAfterInFlight = false;
const dirtyLocationKeys: Set<string> = new Set();

export function normalizeLocationName(placeName: string): string {
  return String(placeName ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s,.'’&()\/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function serializeCache(): Record<string, LatLonPair> {
  const obj: Record<string, LatLonPair> = {};
  for (const [key, value] of locationCache.entries()) {
    obj[key] = value;
  }
  return obj;
}

async function persistCacheToDisk(): Promise<void> {
  const persistStart = logBackgroundTaskStart('NameToLonLatCache:persistCacheToDisk', {
    cacheEntries: locationCache.size,
    dirtyLocationKeys: dirtyLocationKeys.size,
  });
  const keysToFlush = Array.from(dirtyLocationKeys);
  dirtyLocationKeys.clear();
  for (const locationKey of keysToFlush) {
    const value = locationCache.get(locationKey);
    if (!value) {
      continue;
    }
    upsertLocationLatLonCacheRow({
      locationKey,
      lat: value.lat,
      lon: value.lon,
      isHardcoded: value.isHardcoded === true,
    });
  }
  if (keysToFlush.length > 0) {
    recordDatabaseWrite(cacheFilePath)
    recordHybridCacheFlow(cacheFilePath, 'db-direct-write')
  }
  logBackgroundTaskEnd('NameToLonLatCache:persistCacheToDisk', persistStart, {
    cacheEntries: locationCache.size,
    flushedLocationKeys: keysToFlush.length,
    dirtyLocationKeysRemaining: dirtyLocationKeys.size,
  });
}

function scheduleCacheWrite(): void {
  if (cacheWriteTimer !== null) {
    clearTimeout(cacheWriteTimer);
    cacheWriteTimer = null;
  }

  if (cacheWriteInFlight) {
    cacheWriteQueuedAfterInFlight = true;
    return;
  }

  cacheWriteTimer = setTimeout(() => {
    const debounceFlushStart = logBackgroundTaskStart('NameToLonLatCache:debouncedFlush', {
      cacheEntries: locationCache.size,
    });
    cacheWriteTimer = null;
    cacheWriteInFlight = true;

    void persistCacheToDisk()
      .catch((error) => {
        console.warn('Failed to persist location cache:', error);
      })
      .finally(() => {
        logBackgroundTaskEnd('NameToLonLatCache:debouncedFlush', debounceFlushStart, {
          cacheEntries: locationCache.size,
          queuedAfterInFlight: cacheWriteQueuedAfterInFlight,
        });
        cacheWriteInFlight = false;
        if (cacheWriteQueuedAfterInFlight) {
          cacheWriteQueuedAfterInFlight = false;
          scheduleCacheWrite();
        }
      });
  }, CACHE_WRITE_DEBOUNCE_MS);
}

function queueCacheWrite(): Promise<void> {
  scheduleCacheWrite();
  return Promise.resolve();
}

async function loadCacheFromDisk(): Promise<void> {
  if (SKIP_LOCATION_CACHE_LOAD) {
    locationCache.clear()
    console.log(`[Cache] SKIP_LOCATION_CACHE_LOAD=true, loaded 0 locations from database cache.`)
    console.log('[Cache] SKIP_LOCATION_CACHE_LOAD=true, loaded 0 locations from .json cache file.')
    return
  }

  let loadedFromDatabase = 0
  let loadedFromJson = 0
  let evictedHardcodedValues = 0
  let hydratedDatabaseRows = 0

  try {
    const dbRows = readAllLocationLatLonCacheRows()
    recordDatabaseRead(cacheFilePath, dbRows.length > 0)
    recordHybridCacheFlow(cacheFilePath, dbRows.length > 0 ? 'db-read-hit' : 'db-read-miss')

    for (const row of dbRows) {
      const value: LatLonPair = {
        lat: row.lat,
        lon: row.lon,
        isHardcoded: row.isHardcoded,
      }
      if (EVICT_HARDCODED_CACHE_VALUES && value.isHardcoded === true) {
        evictedHardcodedValues += 1
        deleteLocationLatLonCacheRow(row.locationKey)
        continue
      }
      if (value.lat === 37.529998779296875 && value.lon === -122.29000091552734) {
        deleteLocationLatLonCacheRow(row.locationKey)
        continue
      }
      const normalizedKey = normalizeLocationName(row.locationKey)
      if (normalizedKey && !locationCache.has(normalizedKey)) {
        locationCache.set(normalizedKey, { lat: value.lat, lon: value.lon })
        loadedFromDatabase += 1
      }
    }
  } catch (error) {
    console.warn('Failed to load location cache from database:', error)
  }

  try {
    const raw = await fs.readFile(cacheFilePath, 'utf8')
    const value = JSON.parse(decodeLegacyCachePayload(raw)) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Cache payload is not a valid object')
    }

    const parsed = value as Record<string, LatLonPair>
    for (const [key, value] of Object.entries(parsed)) {
      if (
        !value ||
        typeof value.lat !== 'number' ||
        typeof value.lon !== 'number' ||
        !Number.isFinite(value.lat) ||
        !Number.isFinite(value.lon)
      ) {
        continue
      }

      if (EVICT_HARDCODED_CACHE_VALUES && value.isHardcoded === true) {
        evictedHardcodedValues += 1
        console.log(`[Cache] Evicting hardcoded location entry for: ${key}`)
        continue
      }

      // IMPORTANT: Reject poisoned coordinates from BigDataCloud IP geolocation
      // This coordinate pair (San Mateo area) was incorrectly cached for many locations
      if (value.lat === 37.529998779296875 && value.lon === -122.29000091552734) {
        console.log(`[Cache] Skipping poisoned coordinate entry for: ${key}`)
        continue
      }

      const normalizedKey = normalizeLocationName(key)
      if (!normalizedKey || locationCache.has(normalizedKey)) {
        continue
      }

      locationCache.set(normalizedKey, { lat: value.lat, lon: value.lon })
      loadedFromJson += 1
      upsertLocationLatLonCacheRow({
        locationKey: normalizedKey,
        lat: value.lat,
        lon: value.lon,
        isHardcoded: value.isHardcoded === true,
      })
      hydratedDatabaseRows += 1
    }
  } catch (error) {
    console.warn('Failed to load location cache from .json file:', error)
  }

  if (evictedHardcodedValues > 0 || hydratedDatabaseRows > 0) {
    recordDatabaseWrite(cacheFilePath)
    recordHybridCacheFlow(cacheFilePath, 'db-direct-write')
  }
  if (hydratedDatabaseRows > 0) {
    recordHybridCacheFlow(cacheFilePath, 'legacy-read-hit')
    recordHybridCacheFlow(cacheFilePath, 'db-hydrate-write')
  }
  if (EVICT_HARDCODED_CACHE_VALUES && evictedHardcodedValues > 0) {
    console.log(`[Cache] Evicted ${evictedHardcodedValues} hardcoded location entries; rewriting cache without them.`)
    await persistCacheToDisk()
  }

  console.log(`[Cache] Loaded ${loadedFromDatabase} locations from database cache.`)
  console.log(`[Cache] Loaded ${loadedFromJson} locations from .json cache file at ${cacheFilePath}.`)
}

async function ensureCacheLoaded(): Promise<void> {
  if (!cacheLoadPromise) {
    cacheLoadPromise = loadCacheFromDisk();
  }
  await cacheLoadPromise;
}

/**
 * Gets a cached location by its normalized name
 */
export function getCachedLocation(placeName: string): LatLonPair | undefined {
  return locationCache.get(normalizeLocationName(placeName));
}

/**
 * Checks if a location is in the cache
 */
export function hasCachedLocation(placeName: string): boolean {
  return locationCache.has(normalizeLocationName(placeName));
}

/**
 * Stores a location in the cache and queues a write to disk
 */
export function cacheLocation(placeName: string, latLon: LatLonPair): void {
    const normalizedName = normalizeLocationName(placeName);
    if (!normalizedName) {
      return;
    }
    console.log('Caching location:', normalizedName, '->', latLon);
    locationCache.set(normalizedName, latLon);
    dirtyLocationKeys.add(normalizedName);
    queueCacheWrite();
}

/**
 * Ensures the cache is loaded from disk
 */
export async function initializeCache(): Promise<void> {
  await ensureCacheLoaded();
}

/**
 * Clears the location cache
 */
export function clearLocationCache(): void {
  for (const key of locationCache.keys()) {
    deleteLocationLatLonCacheRow(key)
  }
  recordDatabaseWrite(cacheFilePath)
  recordHybridCacheFlow(cacheFilePath, 'db-direct-write')
  locationCache.clear();
  queueCacheWrite();
}

/**
 * Gets the current cache size
 */
export function getCacheSize(): number {
  return locationCache.size;
}
