import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ensureJobTypeClassification } from '../../searching/JobTypeClassify.js';
import { readAnyCache, readFreshCache, writeCache } from '../db/ScrapedJobsDb.js';
import { recordScraperUrlTraversal, runWithScraperSource, setScraperDatabaseSourceUrls, tagJobsWithLoadOrigin } from './ScrapeDebugTelemetry.js';
import { isSqlOnlyCacheLoadingEnabled } from '../../utils/SqlOnlyCacheLoading.js';
import type { ScrapedJob } from './ScrapedJob.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CACHES_NEED_UPDATING_FILE = path.resolve(moduleDir, '../../../cache/cachesNeedUpdating.json');
const SCRAPER_TIMEOUT_MS = 300_000;
const JOB_TYPE_CLASSIFICATION_ENABLED = process.env.JOB_TYPE_CLASSIFICATION_ENABLED === '1'
  || process.env.JOB_TYPE_CLASSIFICATION_ENABLED === 'true';
const LOG_NEW_SCRAPED_JOBS = process.env.LOG_NEW_SCRAPED_JOBS === '1'
  || process.env.LOG_NEW_SCRAPED_JOBS === 'true';

export interface ScraperComponent {
  name: string;
  scrapeJobs: (onPageJobs?: (jobs: ScrapedJob[]) => Promise<void>) => Promise<ScrapedJob[]>;
}

export interface LoadComponentJobsResult {
  jobs: ScrapedJob[];
  refreshedFromSource: boolean;
  newJobsCount: number;
}

interface LoadComponentJobsOptions {
  scrapingEnabled: boolean;
  forceRefreshFromSource?: boolean;
  onPageJobs?: (jobs: ScrapedJob[]) => Promise<void>;
}

function normalizeJobKeyPart(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function buildJobMergeKey(job: ScrapedJob): string {
  const sourceUrl = normalizeJobKeyPart(job.source_url);
  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  // Fallback for sources that occasionally omit URLs.
  return [
    'fallback',
    normalizeJobKeyPart(job.source),
    normalizeJobKeyPart(job.name),
    normalizeJobKeyPart(job.company_name),
    normalizeJobKeyPart(job.location),
    normalizeJobKeyPart(job.posted),
  ].join('|');
}

export function mergeJobsForCache(
  scrapedJobs: ScrapedJob[],
  cachedJobs: ScrapedJob[],
  componentName = '',
): ScrapedJob[] {
  if (componentName === 'ImpactPool' || componentName === 'CharityJob') {
    return scrapedJobs;
  }

  const mergedByKey = new Map<string, ScrapedJob>();

  for (const job of cachedJobs) {
    mergedByKey.set(buildJobMergeKey(job), job);
  }

  for (const job of scrapedJobs) {
    // Freshly scraped values should overwrite stale entries for the same key.
    mergedByKey.set(buildJobMergeKey(job), job);
  }

  return Array.from(mergedByKey.values());
}

function getMergeBreakdown(scrapedJobs: ScrapedJob[], cachedJobs: ScrapedJob[]): {
  scrapedOnly: number;
  cacheOnly: number;
  overlap: number;
} {
  const scrapedKeys = new Set(scrapedJobs.map((job) => buildJobMergeKey(job)));
  const cachedKeys = new Set(cachedJobs.map((job) => buildJobMergeKey(job)));

  let overlap = 0;
  for (const key of scrapedKeys) {
    if (cachedKeys.has(key)) {
      overlap += 1;
    }
  }

  return {
    scrapedOnly: Math.max(0, scrapedKeys.size - overlap),
    cacheOnly: Math.max(0, cachedKeys.size - overlap),
    overlap,
  };
}

function logNewScrapedJobs(componentName: string, jobs: ScrapedJob[]): void {
  if (!LOG_NEW_SCRAPED_JOBS || jobs.length === 0) {
    return;
  }

  for (const job of jobs) {
    console.log(
      [
        `[NewScrapedJob] source=${componentName}`,
        `name=${JSON.stringify(String(job.name ?? ''))}`,
        `company=${JSON.stringify(String(job.company_name ?? ''))}`,
        `date=${JSON.stringify(String(job.posted ?? ''))}`,
        `description=${JSON.stringify(String(job.description ?? ''))}`,
      ].join(' '),
    );
  }
}

function uniqueNames(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  );
}

function parseCachesNeedUpdatingPayload(payload: string): string[] {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (Array.isArray(parsed)) {
      return uniqueNames(parsed.map((value) => String(value ?? '')));
    }

    if (parsed && typeof parsed === 'object') {
      const sourceObject = parsed as { sources?: unknown; caches?: unknown; components?: unknown };
      const candidates = sourceObject.sources ?? sourceObject.caches ?? sourceObject.components;
      if (Array.isArray(candidates)) {
        return uniqueNames(candidates.map((value) => String(value ?? '')));
      }
    }
  } catch {
    return [];
  }

  return [];
}

function ensureCachedJobClassifications(jobs: ScrapedJob[]): boolean {
  if (!JOB_TYPE_CLASSIFICATION_ENABLED) {
    return false;
  }

  let changed = false;
  for (const job of jobs) {
    if (ensureJobTypeClassification(job)) {
      changed = true;
    }
  }
  return changed;
}

export async function readCachesNeedUpdatingRequests(): Promise<string[]> {
  if (isSqlOnlyCacheLoadingEnabled()) {
    return [];
  }

  try {
    const raw = await readFile(CACHES_NEED_UPDATING_FILE, 'utf8');
    return parseCachesNeedUpdatingPayload(raw);
  } catch {
    await writeFile(CACHES_NEED_UPDATING_FILE, '[]\n', 'utf8');
    return [];
  }
}

export async function writeCachesNeedUpdatingRequests(names: string[]): Promise<void> {
  const unique = uniqueNames(names);
  await writeFile(CACHES_NEED_UPDATING_FILE, `${JSON.stringify(unique, null, 2)}\n`, 'utf8');
}

export function resolveCacheRefreshTargets(
  requestedUpdates: string[],
  components: ScraperComponent[],
): { refreshTargets: Set<string>; unknownTargets: string[] } {
  const knownComponentNames = new Set(components.map((component) => component.name));
  const refreshTargets = new Set(requestedUpdates.filter((name) => knownComponentNames.has(name)));
  const unknownTargets = requestedUpdates.filter((name) => !knownComponentNames.has(name));

  return {
    refreshTargets,
    unknownTargets,
  };
}

async function scrapeWithTimeout(component: ScraperComponent, onPageJobs?: (jobs: ScrapedJob[]) => Promise<void>): Promise<{ jobs: ScrapedJob[]; timedOut: boolean }> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<{ jobs: ScrapedJob[]; timedOut: boolean }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ jobs: [], timedOut: true });
    }, SCRAPER_TIMEOUT_MS);
  });

  const scrapePromise = runWithScraperSource(component.name, () => component.scrapeJobs(onPageJobs))
    .then((jobs) => ({ jobs, timedOut: false }));

  const result = await Promise.race([scrapePromise, timeoutPromise]);
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  return result;
}

export async function loadComponentJobs(
  component: ScraperComponent,
  options: LoadComponentJobsOptions,
): Promise<LoadComponentJobsResult> {
  const { scrapingEnabled, forceRefreshFromSource = false, onPageJobs } = options;

  const freshCachedJobs = await readFreshCache(component.name);
  if (freshCachedJobs && !forceRefreshFromSource) {
    const classificationChanged = ensureCachedJobClassifications(freshCachedJobs);
    if (classificationChanged) {
      await writeCache(component.name, freshCachedJobs);
    }

    if (forceRefreshFromSource) {
      console.log(
        `Force refresh requested for ${component.name}, but a fresh cache exists (< 7 days). Using cached jobs instead of pulling from source.`,
      );
    } else {
      console.log(`Loaded ${freshCachedJobs.length} jobs from cache for ${component.name}`);
    }

    tagJobsWithLoadOrigin(freshCachedJobs, component.name, 'cache');
    recordScraperUrlTraversal({
      sourceName: component.name,
      plannedUrlCount: null,
      actualUrlCount: 0,
      stopReason: 'used-fresh-cache',
    });
    return {
      jobs: freshCachedJobs,
      refreshedFromSource: false,
      newJobsCount: 0,
    };
  }

  if (freshCachedJobs && forceRefreshFromSource) {
    console.log(
      `Force refresh requested for ${component.name}; bypassing fresh cache and scraping source anyway.`,
    );
  }

  if (!scrapingEnabled) {
    if (forceRefreshFromSource) {
      console.warn(
        `Force refresh requested for ${component.name}, but scraping is disabled in current environment. Falling back to cache.`,
      );
    }

    const cachedJobs = await readAnyCache(component.name);
    if (cachedJobs) {
      const classificationChanged = ensureCachedJobClassifications(cachedJobs);
      if (classificationChanged) {
        await writeCache(component.name, cachedJobs);
      }

      console.log(
        `Scraping disabled for current environment. Loaded ${cachedJobs.length} cached jobs for ${component.name}`,
      );
      tagJobsWithLoadOrigin(cachedJobs, component.name, 'cache');
      recordScraperUrlTraversal({
        sourceName: component.name,
        plannedUrlCount: null,
        actualUrlCount: 0,
        stopReason: 'scraping-disabled-used-cache',
      });
      return {
        jobs: cachedJobs,
        refreshedFromSource: false,
        newJobsCount: 0,
      };
    }

    console.warn(
      `Scraping disabled for current environment and no cache found for ${component.name}. Returning 0 jobs.`,
    );
    recordScraperUrlTraversal({
      sourceName: component.name,
      plannedUrlCount: null,
      actualUrlCount: 0,
      stopReason: 'scraping-disabled-no-cache',
    });
    return {
      jobs: [],
      refreshedFromSource: false,
      newJobsCount: 0,
    };
  }

  if (forceRefreshFromSource) {
    console.log(`Force refresh: bypassing cache and scraping ${component.name} from source`);
  }

  const existingCachedJobs = await readAnyCache(component.name);
  setScraperDatabaseSourceUrls(
    component.name,
    (existingCachedJobs ?? []).map((job) => String(job.source_url ?? '').trim()).filter(Boolean),
    existingCachedJobs?.length ?? 0,
  );

  const { jobs: scrapedJobs, timedOut } = await scrapeWithTimeout(component, onPageJobs);
  if (timedOut) {
    console.warn(
      `[ScraperTimeout] ${component.name} exceeded ${Math.round(SCRAPER_TIMEOUT_MS / 1000)}s and was bailed out.`,
    );
    recordScraperUrlTraversal({
      sourceName: component.name,
      plannedUrlCount: null,
      actualUrlCount: 0,
      stopReason: 'scraper-timeout',
    });
  }

  if (scrapedJobs.length === 0) {
    console.warn(`Scraper for ${component.name} returned 0 jobs.`);

    const staleCache = existingCachedJobs;
    if (staleCache) {
      const classificationChanged = ensureCachedJobClassifications(staleCache);
      if (classificationChanged) {
        await writeCache(component.name, staleCache);
      }

      console.warn(
        `Using stale cache for ${component.name} because fresh scrape returned 0 jobs (${staleCache.length} jobs)`,
      );
      tagJobsWithLoadOrigin(staleCache, component.name, 'cache');
      recordScraperUrlTraversal({
        sourceName: component.name,
        plannedUrlCount: null,
        actualUrlCount: 0,
        stopReason: 'source-empty-used-stale-cache',
      });
      return {
        jobs: staleCache,
        refreshedFromSource: false,
        newJobsCount: 0,
      };
    }

    recordScraperUrlTraversal({
      sourceName: component.name,
      plannedUrlCount: null,
      actualUrlCount: 0,
      stopReason: timedOut ? 'scraper-timeout-no-cache' : 'source-empty-no-cache',
    });
    return {
      jobs: [],
      refreshedFromSource: false,
      newJobsCount: 0,
    };
  }

  const mergedJobs = existingCachedJobs
    ? mergeJobsForCache(scrapedJobs, existingCachedJobs, component.name)
    : scrapedJobs;

  if (existingCachedJobs) {
    const scrapedJobKeys = new Set(scrapedJobs.map((job) => buildJobMergeKey(job)));
    for (const job of mergedJobs) {
      tagJobsWithLoadOrigin(
        [job],
        component.name,
        scrapedJobKeys.has(buildJobMergeKey(job)) ? 'source' : 'cache',
      );
    }
  } else {
    tagJobsWithLoadOrigin(mergedJobs, component.name, 'source');
  }

  let newJobsCount = scrapedJobs.length;
  let newJobs: ScrapedJob[] = scrapedJobs;
  if (existingCachedJobs) {
    const { scrapedOnly, cacheOnly, overlap } = getMergeBreakdown(scrapedJobs, existingCachedJobs);
    newJobsCount = scrapedOnly;
    const cachedJobKeys = new Set(existingCachedJobs.map((job) => buildJobMergeKey(job)));
    newJobs = scrapedJobs.filter((job) => !cachedJobKeys.has(buildJobMergeKey(job)));
    const refreshMode = forceRefreshFromSource ? 'forced' : 'ttl-refresh';
    console.log(
      `[CacheMerge] ${component.name} (${refreshMode}): scrapedOnly=${scrapedOnly}, cacheOnly=${cacheOnly}, overlap=${overlap}, mergedTotal=${mergedJobs.length}`,
    );
  }

  logNewScrapedJobs(component.name, newJobs);

  await writeCache(component.name, mergedJobs);
  console.log(
    `Scraped ${scrapedJobs.length} jobs from ${component.name} and updated cache with ${mergedJobs.length} merged jobs`,
  );

  return {
    jobs: mergedJobs,
    refreshedFromSource: true,
    newJobsCount,
  };
}
