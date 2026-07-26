import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { readAnyCache, readFreshCache, writeCache } from './ScrapingCache.js';
import type { ScrapedJob } from './ScrapedJob.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CACHES_NEED_UPDATING_FILE = path.resolve(moduleDir, '../../cache/cachesNeedUpdating.json');
const SCRAPER_TIMEOUT_MS = 120_000;

export interface ScraperComponent {
  name: string;
  scrapeJobs: () => Promise<ScrapedJob[]>;
}

export interface LoadComponentJobsResult {
  jobs: ScrapedJob[];
  refreshedFromSource: boolean;
}

interface LoadComponentJobsOptions {
  scrapingEnabled: boolean;
  forceRefreshFromSource?: boolean;
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

export function mergeJobsForCache(scrapedJobs: ScrapedJob[], cachedJobs: ScrapedJob[]): ScrapedJob[] {
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

export async function readCachesNeedUpdatingRequests(): Promise<string[]> {
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

async function scrapeWithTimeout(component: ScraperComponent): Promise<{ jobs: ScrapedJob[]; timedOut: boolean }> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<{ jobs: ScrapedJob[]; timedOut: boolean }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ jobs: [], timedOut: true });
    }, SCRAPER_TIMEOUT_MS);
  });

  const scrapePromise = component.scrapeJobs().then((jobs) => ({ jobs, timedOut: false }));

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
  const { scrapingEnabled, forceRefreshFromSource = false } = options;

  const freshCachedJobs = await readFreshCache(component.name);
  if (freshCachedJobs) {
    if (forceRefreshFromSource) {
      console.log(
        `Force refresh requested for ${component.name}, but a fresh cache exists (< 7 days). Using cached jobs instead of pulling from source.`,
      );
    } else {
      console.log(`Loaded ${freshCachedJobs.length} jobs from cache for ${component.name}`);
    }

    return {
      jobs: freshCachedJobs,
      refreshedFromSource: false,
    };
  }

  if (!scrapingEnabled) {
    if (forceRefreshFromSource) {
      console.warn(
        `Force refresh requested for ${component.name}, but scraping is disabled in current environment. Falling back to cache.`,
      );
    }

    const cachedJobs = await readAnyCache(component.name);
    if (cachedJobs) {
      console.log(
        `Scraping disabled for current environment. Loaded ${cachedJobs.length} cached jobs for ${component.name}`,
      );
      return {
        jobs: cachedJobs,
        refreshedFromSource: false,
      };
    }

    console.warn(
      `Scraping disabled for current environment and no cache found for ${component.name}. Returning 0 jobs.`,
    );
    return {
      jobs: [],
      refreshedFromSource: false,
    };
  }

  if (forceRefreshFromSource) {
    console.log(`Force refresh: bypassing cache and scraping ${component.name} from source`);
  }

  const { jobs: scrapedJobs, timedOut } = await scrapeWithTimeout(component);
  if (timedOut) {
    console.warn(
      `[ScraperTimeout] ${component.name} exceeded ${Math.round(SCRAPER_TIMEOUT_MS / 1000)}s and was bailed out.`,
    );
  }

  if (scrapedJobs.length === 0) {
    console.warn(`Scraper for ${component.name} returned 0 jobs.`);

    const staleCache = await readAnyCache(component.name);
    if (staleCache) {
      console.warn(
        `Using stale cache for ${component.name} because fresh scrape returned 0 jobs (${staleCache.length} jobs)`,
      );
      return {
        jobs: staleCache,
        refreshedFromSource: false,
      };
    }

    return {
      jobs: [],
      refreshedFromSource: false,
    };
  }

  const existingCachedJobs = await readAnyCache(component.name);
  const mergedJobs = existingCachedJobs
    ? mergeJobsForCache(scrapedJobs, existingCachedJobs)
    : scrapedJobs;

  if (existingCachedJobs) {
    const { scrapedOnly, cacheOnly, overlap } = getMergeBreakdown(scrapedJobs, existingCachedJobs);
    const refreshMode = forceRefreshFromSource ? 'forced' : 'ttl-refresh';
    console.log(
      `[CacheMerge] ${component.name} (${refreshMode}): scrapedOnly=${scrapedOnly}, cacheOnly=${cacheOnly}, overlap=${overlap}, mergedTotal=${mergedJobs.length}`,
    );
  }

  await writeCache(component.name, mergedJobs);
  console.log(
    `Scraped ${scrapedJobs.length} jobs from ${component.name} and updated cache with ${mergedJobs.length} merged jobs`,
  );

  return {
    jobs: mergedJobs,
    refreshedFromSource: true,
  };
}
