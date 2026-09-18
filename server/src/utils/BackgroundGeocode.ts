import type { ScrapedJob } from '../scraping/core/ScrapedJob.js';
import { geocodeJobLocations, getJobLocations } from '../searching/searchDistance/SearchDistance.js';
import { setActiveOperation, clearActiveOperation } from '../server/ServerActivityTracker.js';
import { logBackgroundTaskEnd, logBackgroundTaskStart } from './BackgroundTaskTiming.js';

type BackgroundGeocodeCompletionListener = () => void;
const backgroundGeocodeCompletionListeners = new Set<BackgroundGeocodeCompletionListener>();

export function onBackgroundGeocodeComplete(listener: BackgroundGeocodeCompletionListener): () => void {
  backgroundGeocodeCompletionListeners.add(listener);
  return () => {
    backgroundGeocodeCompletionListeners.delete(listener);
  };
}

function notifyBackgroundGeocodeComplete(): void {
  for (const listener of backgroundGeocodeCompletionListeners) {
    try {
      listener();
    } catch (error) {
      console.warn('[BackgroundGeocode] completion listener failed:', error);
    }
  }
}

function isMissingCoordinates(job: ScrapedJob): boolean {
  const locationCount = getJobLocations(job).length;
  if (locationCount > 1 && (!Array.isArray(job.location_coordinates) || job.location_coordinates.length < locationCount)) {
    return true;
  }

  return (
    typeof job.location_lat !== 'number' ||
    typeof job.location_lon !== 'number' ||
    Number.isNaN(job.location_lat) ||
    Number.isNaN(job.location_lon) ||
    (job.location_lat === 0 && job.location_lon === 0)
  );
}

export function startBackgroundGeocodeJobs(jobs: ScrapedJob[]): void {

  if (process.env.DISABLE_BACKGROUND_GEOCODE === 'true') {
    console.log('[BackgroundGeocode] Disabled via env.DISABLE_BACKGROUND_GEOCODE=true');
    return;
  }

  const startedAtMs = Date.now();
  const workerTimingStart = logBackgroundTaskStart('BackgroundGeocode:worker', {
    totalJobs: jobs.length,
  });
  console.log(`[BackgroundGeocode] Triggered for ${jobs.length} jobs.`);

  // ── Count missing coords (sync scan — tag it so the monitor sees it) ──────
  const countMissingStart = logBackgroundTaskStart('BackgroundGeocode:countMissingCoords');
  setActiveOperation('BackgroundGeocode: counting missing coords')
  const missingIndices: number[] = []
  for (let i = 0; i < jobs.length; i++) {
    if (isMissingCoordinates(jobs[i])) missingIndices.push(i)
  }
  const missingCoordinatesCount = missingIndices.length
  clearActiveOperation('BackgroundGeocode: counting missing coords')
  logBackgroundTaskEnd('BackgroundGeocode:countMissingCoords', countMissingStart, {
    missingCoordinatesCount,
  });

  if (missingCoordinatesCount === 0) {
    console.log('[BackgroundGeocode] Skipping: no jobs are missing coordinates.');
    logBackgroundTaskEnd('BackgroundGeocode:worker', workerTimingStart, {
      resolved: 0,
      remaining: 0,
      skipped: true,
    });
    notifyBackgroundGeocodeComplete();
    return;
  }

  console.log(
    `[BackgroundGeocode] Starting startup geocoding for ${missingCoordinatesCount}/${jobs.length} jobs missing coordinates...`
  );

  // Fire-and-forget: do not block startup/search availability on geocoding.
  void (async () => {
    try {
      console.log('[BackgroundGeocode] Worker started (non-blocking).');

      // Only pass jobs that are missing coords — skips the 347k regex scan
      // for jobs that already have valid coordinates.
      const buildSubsetStart = logBackgroundTaskStart('BackgroundGeocode:buildSubset');
      const jobsMissingCoords = missingIndices.map((i) => jobs[i])
      logBackgroundTaskEnd('BackgroundGeocode:buildSubset', buildSubsetStart, {
        jobsMissingCoords: jobsMissingCoords.length,
      });

      const geocodeLookupStart = logBackgroundTaskStart('BackgroundGeocode:geocodeLookup', {
        jobsMissingCoords: jobsMissingCoords.length,
      });
      setActiveOperation(`BackgroundGeocode: geocoding ${jobsMissingCoords.length} jobs`)
      const geocodedSubset = await geocodeJobLocations(jobsMissingCoords, true);
      clearActiveOperation('BackgroundGeocode: geocoding')
      logBackgroundTaskEnd('BackgroundGeocode:geocodeLookup', geocodeLookupStart, {
        geocodedSubset: geocodedSubset.length,
      });

      console.log('[BackgroundGeocode] Geocode lookup pass completed. Merging coordinates into in-memory jobs...');

      // Merge results back in chunks so the event loop stays free.
      const mergeStart = logBackgroundTaskStart('BackgroundGeocode:mergeResults', {
        geocodedSubset: geocodedSubset.length,
      });
      setActiveOperation('BackgroundGeocode: merging results')
      const MERGE_CHUNK = 5_000
      for (let ci = 0; ci < geocodedSubset.length; ci += MERGE_CHUNK) {
        for (let j = ci; j < Math.min(ci + MERGE_CHUNK, geocodedSubset.length); j++) {
          const originalIndex = missingIndices[j]
          jobs[originalIndex].location_lat = geocodedSubset[j].location_lat;
          jobs[originalIndex].location_lon = geocodedSubset[j].location_lon;
          jobs[originalIndex].location_coordinates = geocodedSubset[j].location_coordinates;
        }
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      clearActiveOperation('BackgroundGeocode: merging results')
      logBackgroundTaskEnd('BackgroundGeocode:mergeResults', mergeStart, {
        mergeChunk: MERGE_CHUNK,
      });

      // Count remaining without a full scan — subtract resolved from known missing
      const countRemainingStart = logBackgroundTaskStart('BackgroundGeocode:countRemaining');
      setActiveOperation('BackgroundGeocode: counting remaining')
      let geocodedCount = 0
      for (let j = 0; j < geocodedSubset.length; j++) {
        if (!isMissingCoordinates(geocodedSubset[j])) geocodedCount++
      }
      clearActiveOperation('BackgroundGeocode: counting remaining')
      logBackgroundTaskEnd('BackgroundGeocode:countRemaining', countRemainingStart, {
        geocodedCount,
      });

      const remainingMissingCoordinatesCount = missingCoordinatesCount - geocodedCount;
      const resolvedPct = missingCoordinatesCount > 0
        ? ((geocodedCount / missingCoordinatesCount) * 100).toFixed(1)
        : '0.0';
      const durationMs = Date.now() - startedAtMs;

      console.log(
        `[BackgroundGeocode] Startup geocoding complete: resolved ${geocodedCount}/${missingCoordinatesCount} missing job coordinates (${resolvedPct}%). Remaining missing: ${remainingMissingCoordinatesCount}. Took ${durationMs}ms.`
      );
      logBackgroundTaskEnd('BackgroundGeocode:worker', workerTimingStart, {
        resolved: geocodedCount,
        remaining: remainingMissingCoordinatesCount,
      });
      notifyBackgroundGeocodeComplete();
    } catch (error) {
      clearActiveOperation('BackgroundGeocode')
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAtMs;
      console.error(`[BackgroundGeocode] Startup geocoding failed after ${durationMs}ms: ${message}`);
      logBackgroundTaskEnd('BackgroundGeocode:worker', workerTimingStart, {
        error: message,
      });
      notifyBackgroundGeocodeComplete();
    }
  })();
}
