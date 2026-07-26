import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CacheHandler } from './CacheHandler.js';

export interface LatLonPair {
  lat: number;
  lon: number;
  isHardcoded?: boolean; // Flag to indicate if this is from hardcoded fallback (less accurate)
}

// Global cache for storing location name -> lat/lon mappings
const locationCache: Map<string, LatLonPair> = new Map();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const cacheFilePath = path.resolve(moduleDir, '../../cache/locations.json');
const cacheHandler = new CacheHandler(cacheFilePath);
console.log("Location cache file path:", cacheFilePath);

let cacheLoadPromise: Promise<void> | null = null;

function serializeCache(): Record<string, LatLonPair> {
  const obj: Record<string, LatLonPair> = {};
  for (const [key, value] of locationCache.entries()) {
    obj[key] = value;
  }
  return obj;
}

async function persistCacheToDisk(): Promise<void> {
  const payload = JSON.stringify(serializeCache(), null, 2);
  await cacheHandler.save(payload);
  console.log("persistCacheToDisk::", cacheFilePath);
  console.trace("persistCacheToDisk:: stack trace");
}

function queueCacheWrite(): Promise<void> {
  return persistCacheToDisk()
    .catch((error) => {
      console.warn('Failed to persist location cache:', error);
    });
}

async function loadCacheFromDisk(): Promise<void> {
  try {
    const parsed = await cacheHandler.loadWithFallback((raw) => {
      const value = JSON.parse(raw) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Cache payload is not a valid object');
      }
      return value as Record<string, LatLonPair>;
    });
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value.lat === 'number' &&
        typeof value.lon === 'number' &&
        Number.isFinite(value.lat) &&
        Number.isFinite(value.lon)
      ) {
        // IMPORTANT: Reject poisoned coordinates from BigDataCloud IP geolocation
        // This coordinate pair (San Mateo area) was incorrectly cached for many locations
        // temp
        if (value.lat === 37.529998779296875 && value.lon === -122.29000091552734) {
          console.log(`[Cache] Skipping poisoned coordinate entry for: ${key}`);
          continue; // Skip this entry, forces re-geocoding via API strategies
        }
        locationCache.set(key, { lat: value.lat, lon: value.lon });
      }
    }
  } catch (error) {
    console.warn('Failed to load location cache from disk:', error);
  }
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
export function getCachedLocation(normalizedName: string): LatLonPair | undefined {
  return locationCache.get(normalizedName);
}

/**
 * Checks if a location is in the cache
 */
export function hasCachedLocation(normalizedName: string): boolean {
  return locationCache.has(normalizedName);
}

/**
 * Stores a location in the cache and queues a write to disk
 */
export function cacheLocation(normalizedName: string, latLon: LatLonPair): void {
    console.log('Caching location:', normalizedName, '->', latLon);
    locationCache.set(normalizedName, latLon);
    void queueCacheWrite();
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
  locationCache.clear();
  void queueCacheWrite();
}

/**
 * Gets the current cache size
 */
export function getCacheSize(): number {
  return locationCache.size;
}
