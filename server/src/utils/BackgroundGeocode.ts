import type { ScrapedJob } from '../scraping/ScrapedJob.js';
import { geocodeJobLocations } from '../searching/SearchDistance.js';
import { setActiveOperation, clearActiveOperation } from './ServerActivityTracker.js';

function isMissingCoordinates(job: ScrapedJob): boolean {
  return (
    typeof job.location_lat !== 'number' ||
    typeof job.location_lon !== 'number' ||
    Number.isNaN(job.location_lat) ||
    Number.isNaN(job.location_lon) ||
    (job.location_lat === 0 && job.location_lon === 0)
  );
}

export function startBackgroundGeocodeJobs(jobs: ScrapedJob[]): void {
  const startedAtMs = Date.now();
  console.log(`[BackgroundGeocode] Triggered for ${jobs.length} jobs.`);

  // ── Count missing coords (sync scan — tag it so the monitor sees it) ──────
  setActiveOperation('BackgroundGeocode: counting missing coords')
  const missingIndices: number[] = []
  for (let i = 0; i < jobs.length; i++) {
    if (isMissingCoordinates(jobs[i])) missingIndices.push(i)
  }
  const missingCoordinatesCount = missingIndices.length
  clearActiveOperation('BackgroundGeocode: counting missing coords')

  if (missingCoordinatesCount === 0) {
    console.log('[BackgroundGeocode] Skipping: no jobs are missing coordinates.');
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
      const jobsMissingCoords = missingIndices.map((i) => jobs[i])
      setActiveOperation(`BackgroundGeocode: geocoding ${jobsMissingCoords.length} jobs`)
      const geocodedSubset = await geocodeJobLocations(jobsMissingCoords, true);
      clearActiveOperation('BackgroundGeocode: geocoding')

      console.log('[BackgroundGeocode] Geocode lookup pass completed. Merging coordinates into in-memory jobs...');

      // Merge results back in chunks so the event loop stays free.
      setActiveOperation('BackgroundGeocode: merging results')
      const MERGE_CHUNK = 5_000
      for (let ci = 0; ci < geocodedSubset.length; ci += MERGE_CHUNK) {
        for (let j = ci; j < Math.min(ci + MERGE_CHUNK, geocodedSubset.length); j++) {
          const originalIndex = missingIndices[j]
          jobs[originalIndex].location_lat = geocodedSubset[j].location_lat;
          jobs[originalIndex].location_lon = geocodedSubset[j].location_lon;
        }
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      clearActiveOperation('BackgroundGeocode: merging results')

      // Count remaining without a full scan — subtract resolved from known missing
      setActiveOperation('BackgroundGeocode: counting remaining')
      let geocodedCount = 0
      for (let j = 0; j < geocodedSubset.length; j++) {
        if (!isMissingCoordinates(geocodedSubset[j])) geocodedCount++
      }
      clearActiveOperation('BackgroundGeocode: counting remaining')

      const remainingMissingCoordinatesCount = missingCoordinatesCount - geocodedCount;
      const resolvedPct = missingCoordinatesCount > 0
        ? ((geocodedCount / missingCoordinatesCount) * 100).toFixed(1)
        : '0.0';
      const durationMs = Date.now() - startedAtMs;

      console.log(
        `[BackgroundGeocode] Startup geocoding complete: resolved ${geocodedCount}/${missingCoordinatesCount} missing job coordinates (${resolvedPct}%). Remaining missing: ${remainingMissingCoordinatesCount}. Took ${durationMs}ms.`
      );
    } catch (error) {
      clearActiveOperation('BackgroundGeocode')
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAtMs;
      console.error(`[BackgroundGeocode] Startup geocoding failed after ${durationMs}ms: ${message}`);
    }
  })();
}
