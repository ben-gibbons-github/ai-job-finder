import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CacheHandler } from '../utils/CacheHandler.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.resolve(__dirname, '../../cache/locationsearch.json');
const cacheHandler = new CacheHandler(CACHE_FILE_PATH);
const locationSearchCache = new Map();
let loadPromise = null;
async function ensureCacheLoaded() {
    if (loadPromise) {
        return loadPromise;
    }
    loadPromise = (async () => {
        try {
            const parsed = await cacheHandler.loadWithFallback((raw) => JSON.parse(raw));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return;
            }
            const asRecord = parsed;
            for (const [query, results] of Object.entries(asRecord)) {
                if (!query || !Array.isArray(results)) {
                    continue;
                }
                const filtered = results.filter((item) => {
                    return (item &&
                        typeof item.value === 'string' &&
                        typeof item.label === 'string' &&
                        typeof item.displayLabel === 'string' &&
                        Number.isFinite(item.lat) &&
                        Number.isFinite(item.lng));
                });
                if (filtered.length > 0) {
                    locationSearchCache.set(query, filtered);
                }
            }
        }
        catch {
            // No cache file yet or invalid JSON; start with empty in-memory cache.
        }
    })();
    return loadPromise;
}
async function persistCacheToDisk() {
    const payload = Object.fromEntries(locationSearchCache);
    await cacheHandler.save(JSON.stringify(payload, null, 2)).catch(() => undefined);
    console.trace("persistCacheToDisk:: stack trace");
}
export async function getCachedLocationSearch(query) {
    await ensureCacheLoaded();
    return locationSearchCache.get(query) ?? null;
}
export async function setCachedLocationSearch(query, results) {
    if (!query || results.length === 0) {
        return;
    }
    await ensureCacheLoaded();
    locationSearchCache.set(query, results);
    await persistCacheToDisk();
}
