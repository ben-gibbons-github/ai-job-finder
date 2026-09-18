import { cacheLocation, hasCachedLocation, initializeCache, normalizeLocationName } from './NameToLonLatCache.js';
import { geocodingStrategies } from './NameToLonLat/NameToLonLatStrategies.js';
import { clearActiveOperation, setActiveOperation } from '../server/ServerActivityTracker.js';
import { logBackgroundTaskEnd, logBackgroundTaskStart } from './BackgroundTaskTiming.js';
const NAME_TO_LON_LAT_PHASE_LOG_ENABLED = String(process.env.NAME_TO_LONLAT_PHASE_LOG ?? '').toLowerCase() === 'true';
function logRetryTimings(event, details) {
    if (!NAME_TO_LON_LAT_PHASE_LOG_ENABLED) {
        return;
    }
    console.log(`[NameToLonLatRetry][timing] ${event} ${JSON.stringify(details)}`);
}
const retryQueue = [];
const queuedNames = new Set();
const RETRY_WORK_INTERVAL_MS = 10_000;
const BASE_RETRY_DELAY_MS = 90_000;
const MAX_RETRY_DELAY_MS = 30 * 60_000;
let workerStarted = false;
let workerIsBusy = false;
function computeRetryDelayMs(attempts) {
    const exponential = BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1);
    return Math.min(exponential, MAX_RETRY_DELAY_MS);
}
function scheduleForRetry(item) {
    if (!queuedNames.has(item.normalizedName)) {
        retryQueue.push(item);
        queuedNames.add(item.normalizedName);
    }
}
async function processRetryItem(item) {
    const totalStart = performance.now();
    const phasesMs = {};
    const strategyAttempts = [];
    const markPhase = (phase, startedAt) => {
        phasesMs[phase] = Number((performance.now() - startedAt).toFixed(2));
    };
    const initializeStart = performance.now();
    await initializeCache();
    markPhase('initializeCache', initializeStart);
    const cacheLookupStart = performance.now();
    if (hasCachedLocation(item.normalizedName)) {
        markPhase('cacheLookup', cacheLookupStart);
        markPhase('total', totalStart);
        logRetryTimings('cache-hit', {
            normalizedName: item.normalizedName,
            attempts: item.attempts,
            phasesMs,
            strategyAttempts,
        });
        return;
    }
    markPhase('cacheLookup', cacheLookupStart);
    for (const strategy of geocodingStrategies) {
        const strategyStart = performance.now();
        try {
            const latLon = await strategy(item.normalizedName);
            strategyAttempts.push({
                strategy: strategy.name || 'anonymousStrategy',
                ms: Number((performance.now() - strategyStart).toFixed(2)),
                ok: true,
            });
            const cacheWriteStart = performance.now();
            cacheLocation(item.normalizedName, latLon);
            markPhase('cacheWrite', cacheWriteStart);
            markPhase('total', totalStart);
            logRetryTimings('strategy-success', {
                normalizedName: item.normalizedName,
                attempts: item.attempts,
                strategy: strategy.name || 'anonymousStrategy',
                phasesMs,
                strategyAttempts,
            });
            return;
        }
        catch (error) {
            strategyAttempts.push({
                strategy: strategy.name || 'anonymousStrategy',
                ms: Number((performance.now() - strategyStart).toFixed(2)),
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    const nextAttempts = item.attempts + 1;
    const retryDelayMs = computeRetryDelayMs(nextAttempts);
    const requeueStart = performance.now();
    scheduleForRetry({
        ...item,
        attempts: nextAttempts,
        nextAttemptAt: Date.now() + retryDelayMs,
    });
    markPhase('requeue', requeueStart);
    markPhase('total', totalStart);
    logRetryTimings('all-strategies-failed-requeued', {
        normalizedName: item.normalizedName,
        attempts: item.attempts,
        nextAttempts,
        retryDelayMs,
        phasesMs,
        strategyAttempts,
    });
}
async function processOneDueRetryItem() {
    if (workerIsBusy) {
        return;
    }
    const now = Date.now();
    const dueIndex = retryQueue.findIndex((item) => item.nextAttemptAt <= now);
    if (dueIndex === -1) {
        return;
    }
    const [item] = retryQueue.splice(dueIndex, 1);
    queuedNames.delete(item.normalizedName);
    workerIsBusy = true;
    try {
        await processRetryItem(item);
    }
    finally {
        workerIsBusy = false;
    }
}
export function startNameToLonLatRetryWorker() {
    if (workerStarted) {
        return;
    }
    workerStarted = true;
    const timer = setInterval(() => {
        const op = 'heartbeat:name-to-lonlat-retry';
        const tickStart = logBackgroundTaskStart('NameToLonLatRetry:heartbeatTick', {
            queueSize: retryQueue.length,
        });
        setActiveOperation(op);
        void processOneDueRetryItem().finally(() => {
            clearActiveOperation(op);
            logBackgroundTaskEnd('NameToLonLatRetry:heartbeatTick', tickStart, {
                queueSize: retryQueue.length,
                workerIsBusy,
            });
        });
    }, RETRY_WORK_INTERVAL_MS);
    timer.unref();
}
export function enqueueNameToLonLatRetry(placeName) {
    const normalizedName = normalizeLocationName(placeName);
    if (!normalizedName || queuedNames.has(normalizedName) || hasCachedLocation(normalizedName)) {
        return;
    }
    startNameToLonLatRetryWorker();
    const firstDelayMs = computeRetryDelayMs(1);
    scheduleForRetry({
        normalizedName,
        attempts: 1,
        nextAttemptAt: Date.now() + firstDelayMs,
    });
}
