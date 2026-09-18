import { getCachedLocation, hasCachedLocation, cacheLocation, normalizeLocationName, initializeCache, } from './NameToLonLatCache.js';
import { geocodingStrategies } from './NameToLonLat/NameToLonLatStrategies.js';
import { enqueueNameToLonLatRetry, startNameToLonLatRetryWorker } from './NameToLonLatRetryQueue.js';
const NAME_TO_LON_LAT_PHASE_LOG_ENABLED = String(process.env.NAME_TO_LONLAT_PHASE_LOG ?? '').toLowerCase() === 'true';
function logNameToLonLatTimings(event, details) {
    if (!NAME_TO_LON_LAT_PHASE_LOG_ENABLED) {
        return;
    }
    console.log(`[NameToLonLat][timing] ${event} ${JSON.stringify(details)}`);
}
startNameToLonLatRetryWorker();
/**
 * Converts a place name to latitude and longitude coordinates
 * Uses a global cache to avoid repeated API calls for the same location
 * Tries up to 5 different geocoding APIs in order, rotating on failure
 * @param placeName - The name of the place to geocode
 * @returns Promise resolving to {lat, lon} pair
 */
export async function nameToLonLat(placeName) {
    const totalStart = performance.now();
    const phasesMs = {};
    const strategyAttempts = [];
    const markPhase = (phase, startedAt) => {
        phasesMs[phase] = Number((performance.now() - startedAt).toFixed(2));
    };
    const initializeStart = performance.now();
    await initializeCache();
    markPhase('initializeCache', initializeStart);
    const normalizeStart = performance.now();
    const normalizedName = normalizeLocationName(placeName);
    markPhase('normalize', normalizeStart);
    if (!normalizedName) {
        markPhase('total', totalStart);
        logNameToLonLatTimings('invalid-input', {
            placeName,
            phasesMs,
            attempts: strategyAttempts,
        });
        throw new Error('Cannot geocode an empty location');
    }
    const cacheLookupStart = performance.now();
    if (hasCachedLocation(normalizedName)) {
        markPhase('cacheLookup', cacheLookupStart);
        markPhase('total', totalStart);
        logNameToLonLatTimings('cache-hit', {
            placeName,
            normalizedName,
            phasesMs,
            attempts: strategyAttempts,
        });
        return getCachedLocation(normalizedName);
    }
    markPhase('cacheLookup', cacheLookupStart);
    let lastError = null;
    for (const strategy of geocodingStrategies) {
        const strategyStart = performance.now();
        try {
            const latLon = await strategy(normalizedName);
            strategyAttempts.push({
                strategy: strategy.name || 'anonymousStrategy',
                ms: Number((performance.now() - strategyStart).toFixed(2)),
                ok: true,
            });
            // Store only non-fallback results in cache.
            if (latLon.isHardcoded !== true) {
                const cacheWriteStart = performance.now();
                cacheLocation(normalizedName, latLon);
                markPhase('cacheWrite', cacheWriteStart);
            }
            markPhase('total', totalStart);
            logNameToLonLatTimings('strategy-success', {
                placeName,
                normalizedName,
                strategy: strategy.name || 'anonymousStrategy',
                isHardcoded: latLon.isHardcoded === true,
                phasesMs,
                attempts: strategyAttempts,
            });
            return latLon;
        }
        catch (err) {
            strategyAttempts.push({
                strategy: strategy.name || 'anonymousStrategy',
                ms: Number((performance.now() - strategyStart).toFixed(2)),
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            });
            lastError = err;
        }
    }
    const enqueueRetryStart = performance.now();
    enqueueNameToLonLatRetry(normalizedName);
    markPhase('enqueueRetry', enqueueRetryStart);
    markPhase('total', totalStart);
    logNameToLonLatTimings('all-strategies-failed', {
        placeName,
        normalizedName,
        phasesMs,
        attempts: strategyAttempts,
        lastError: lastError instanceof Error ? lastError.message : String(lastError),
    });
    throw new Error(`Failed to geocode location "${placeName}" with all providers: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
// Re-export cache functions for backwards compatibility
export { clearLocationCache, getCacheSize, normalizeLocationName } from './NameToLonLatCache.js';
