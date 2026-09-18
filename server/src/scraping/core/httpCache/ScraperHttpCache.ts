import {
  getCurrentScraperSource,
  recordUrlCacheHit,
  recordUrlCacheMiss,
} from '../ScrapeDebugTelemetry.js';
import { RateLimitedScrapeError, isRateLimitedScrapeError, isRateLimitedStatus } from './ScraperHttpErrors.js';
import {
  buildCacheKey,
  getCacheTtlMs,
  getHttpCacheDatabaseEntryCount,
  getHttpCacheEntryCount,
  loadFreshCacheEntry,
  makeResponseFromCacheEntry,
  NETWORK_FAILURE_STATUS,
  normalizeMethod,
  resolveUrl,
  saveCacheEntry,
  shouldCacheUrl,
  toHeaderRecord,
  type CachedHttpResponse,
} from './ScraperHttpCacheStorage.js';

export { RateLimitedScrapeError, isRateLimitedScrapeError } from './ScraperHttpErrors.js';

const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
const SKIP_CACHED_HTTP_PAGES_ENV = 'SKIP_PARSING_CACHED_HTTP_PAGES';
const SKIP_HTTP_CACHE_HIT_LOGS_ENV = 'SKIP_HTTP_CACHE_HIT_LOGS';
const rateLimitedHosts = new Map<string, { untilMs: number; status: number }>();
const cachedResponses = new WeakSet<Response>();
let installedOriginalFetch: typeof globalThis.fetch | null = null;

function getRateLimitCooldownMs(): number {
  return Math.max(1000, Number(process.env.SCRAPER_RATE_LIMIT_COOLDOWN_MS || DEFAULT_RATE_LIMIT_COOLDOWN_MS));
}

function isEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function getHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url;
  }
}

function getSafeLogUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'jooble.org' && /^\/api\/[^/]+$/i.test(parsed.pathname)) {
      parsed.pathname = '/api/[REDACTED]';
    }
    if (parsed.hostname === 'api.adzuna.com' && parsed.searchParams.has('app_key')) {
      parsed.searchParams.set('app_key', '[REDACTED]');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function getSourceLabel(): string {
  return getCurrentScraperSource() || 'unknown';
}

function attachFromCacheFlag(response: Response, fromCache: boolean): Response & { fromCache: boolean } {
  Object.defineProperty(response, 'fromCache', {
    value: fromCache,
    enumerable: true,
    configurable: true,
    writable: false,
  });
  return response as Response & { fromCache: boolean };
}

function getRateLimitKey(url: string): string {
  const host = getHost(url);
  if (host === 'localhost' || host === '::1' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host;
  }

  const labels = host.split('.').filter(Boolean);
  return labels.length >= 2 ? labels.slice(-2).join('.') : host;
}

function getActiveHostRateLimit(url: string): { untilMs: number; status: number } | null {
  const rateLimit = rateLimitedHosts.get(getRateLimitKey(url));
  if (!rateLimit) {
    return null;
  }
  if (Date.now() >= rateLimit.untilMs) {
    rateLimitedHosts.delete(getRateLimitKey(url));
    return null;
  }
  return rateLimit;
}

function markHostRateLimited(url: string, status: number): void {
  rateLimitedHosts.set(getRateLimitKey(url), {
    untilMs: Date.now() + getRateLimitCooldownMs(),
    status,
  });
}

export interface CachedFetchResult {
  response: Response;
  fromCache: boolean;
}

async function cachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  originalFetch = globalThis.fetch.bind(globalThis),
): Promise<CachedFetchResult> {
  // console.log(`[ScraperHttpCache] FETCH source=${getSourceLabel()} url=${getSafeLogUrl(resolveUrl(input))}`);

  const url = resolveUrl(input);
  if (!shouldCacheUrl(url)) {
    console.log(`[ScraperHttpCache] BYPASS uncacheable url source=${getSourceLabel()} url=${getSafeLogUrl(url)}`);
    const response = attachFromCacheFlag(await originalFetch(input, init), false);
    // console.log(`[ScraperHttpCache] RETURN uncacheable source=${getSourceLabel()} url=${getSafeLogUrl(url)}`);
    return { response, fromCache: false };
  }

  const activeHostRateLimit = getActiveHostRateLimit(url);
  if (activeHostRateLimit) {
    const method = normalizeMethod(input, init);
    const remainingMs = Math.max(0, activeHostRateLimit.untilMs - Date.now());
    console.log(
      `[ScraperHttpCache] RATE-LIMIT COOLDOWN source=${getSourceLabel()} host=${getRateLimitKey(url)} remainingMs=${remainingMs} method=${method} url=${getSafeLogUrl(url)}`,
    );
    // console.log(`[ScraperHttpCache] THROW rate-limit source=${getSourceLabel()} host=${getRateLimitKey(url)} url=${getSafeLogUrl(url)}`);
    throw new RateLimitedScrapeError(activeHostRateLimit.status, url, method);
  }

  const cacheKey = await buildCacheKey(input, init);
  // console.log(`[ScraperHttpCache] STEP cacheKey-built source=${getSourceLabel()} url=${getSafeLogUrl(url)}`);
  const cached = await loadFreshCacheEntry(cacheKey);
  // console.log(`[ScraperHttpCache] STEP cache-lookup-done source=${getSourceLabel()} found=${Boolean(cached)} url=${getSafeLogUrl(url)}`);
  const cachePages = await getHttpCacheEntryCount();
  // console.log(`[ScraperHttpCache] STEP cache-count-done source=${getSourceLabel()} cachePages=${cachePages} url=${getSafeLogUrl(url)}`);
  if (cached) {
    recordUrlCacheHit(getCurrentScraperSource());
    const skipParsing = shouldSkipParsingCachedHttpPages();
    if (!isEnabled(process.env[SKIP_HTTP_CACHE_HIT_LOGS_ENV], false)) {
      console.log(
        `[ScraperHttpCache] HIT source=${getSourceLabel()} cachePages=${cachePages} parse=${skipParsing ? 'skipped' : 'enabled'} method=${cached.method} status=${cached.status} url=${getSafeLogUrl(cached.url)}`,
      );
    }
    if (cached.networkError) {
      console.log(
        `[ScraperHttpCache] HIT cached-network-failure source=${getSourceLabel()} method=${cached.method} url=${getSafeLogUrl(cached.url)}`,
      );
      // console.log(`[ScraperHttpCache] THROW cached-network-failure source=${getSourceLabel()} url=${getSafeLogUrl(url)}`);
      throw new Error(cached.errorMessage || `[ScraperHttpCache] Cached network failure for ${url}`);
    }
    const cachedResponse = attachFromCacheFlag(makeResponseFromCacheEntry(cached), true);
    cachedResponses.add(cachedResponse);
    console.log(`[ScraperHttpCache] RETURN cached-response source=${getSourceLabel()} url=${getSafeLogUrl(url)}`);
    return { response: cachedResponse, fromCache: true };
  }

  recordUrlCacheMiss(getCurrentScraperSource());
  console.log(
    `[ScraperHttpCache] MISS source=${getSourceLabel()} cachePages=${cachePages} method=${normalizeMethod(input, init)} url=${getSafeLogUrl(url)}`,
  );

  try {
    // console.log(`[ScraperHttpCache] STEP calling-original-fetch source=${getSourceLabel()} url=${getSafeLogUrl(url)}`);
    const response = await originalFetch(input, init);
    // console.log(`[ScraperHttpCache] STEP original-fetch-resolved source=${getSourceLabel()} status=${response.status} url=${getSafeLogUrl(url)}`);
    const responseBody = await response.clone().text().catch(() => '');
    // console.log(`[ScraperHttpCache] STEP response-body-read source=${getSourceLabel()} bytes=${responseBody.length} url=${getSafeLogUrl(url)}`);
    const method = normalizeMethod(input, init);

    if (isRateLimitedStatus(response.status)) {
      markHostRateLimited(url, response.status);
      console.log(
        `[ScraperHttpCache] BYPASS rate-limited response source=${getSourceLabel()} host=${getRateLimitKey(url)} cooldownMs=${getRateLimitCooldownMs()} method=${method} status=${response.status} url=${getSafeLogUrl(url)}`,
      );
      // console.log(`[ScraperHttpCache] THROW remote-rate-limit source=${getSourceLabel()} url=${getSafeLogUrl(url)} status=${response.status}`);
      throw new RateLimitedScrapeError(response.status, url, method);
    }

    const now = Date.now();
    const entry: CachedHttpResponse = {
      cacheKey,
      url: getSafeLogUrl(url),
      method,
      status: response.status,
      statusText: response.statusText,
      headers: toHeaderRecord(response.headers),
      bodyText: responseBody,
      cachedAt: now,
      expiresAt: now + getCacheTtlMs(),
      networkError: false,
    };

    console.log(
      `[ScraperHttpCache] SAVED source=${getSourceLabel()} method=${method} status=${response.status} url=${getSafeLogUrl(url)}`,
    );
    await saveCacheEntry(entry);
    console.log(`[ScraperHttpCache] STEP cache-entry-saved source=${getSourceLabel()} url=${getSafeLogUrl(url)}`);
    const cachedResultResponse = attachFromCacheFlag(response, false);
    // console.log(`[ScraperHttpCache] RETURN fresh-response source=${getSourceLabel()} url=${getSafeLogUrl(url)} status=${response.status}`);
    return { response: cachedResultResponse, fromCache: false };
  } catch (error) {
    if (isRateLimitedScrapeError(error)) {
      throw error;
    }

    const now = Date.now();
    const entry: CachedHttpResponse = {
      cacheKey,
      url: getSafeLogUrl(url),
      method: normalizeMethod(input, init),
      status: NETWORK_FAILURE_STATUS,
      statusText: 'Network Failure',
      headers: {},
      bodyText: '',
      cachedAt: now,
      expiresAt: now + getCacheTtlMs(),
      networkError: true,
      errorMessage: String(error),
    };

    console.log(
      `[ScraperHttpCache] NETWORK-FAILURE source=${getSourceLabel()} method=${entry.method} url=${getSafeLogUrl(url)} error=${String(error)}`,
    );
    // console.log(`[ScraperHttpCache] THROW network-failure source=${getSourceLabel()} url=${getSafeLogUrl(url)} error=${String(error)}`);
    await saveCacheEntry(entry);
    throw error;
  }
}

export async function scraperFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response & { fromCache: boolean }> {
  const { response, fromCache } = await cachedFetch(input, init, installedOriginalFetch ?? globalThis.fetch.bind(globalThis));
  return attachFromCacheFlag(response, fromCache);
}

export function isCachedHttpResponse(response: Response): boolean {
  return cachedResponses.has(response);
}

export function shouldSkipParsingCachedHttpPages(): boolean {
  return isEnabled(process.env[SKIP_CACHED_HTTP_PAGES_ENV], true);
}

export function getRateLimitCacheStatus(): {
  activeHosts: number;
  cooldownMs: number;
  grouping: string;
} {
  return {
    activeHosts: rateLimitedHosts.size,
    cooldownMs: getRateLimitCooldownMs(),
    grouping: 'registrable-domain',
  };
}

export function resetRateLimitCache(): void {
  rateLimitedHosts.clear();
}

export function installScraperHttpCache(): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  installedOriginalFetch = originalFetch;
  const rateLimitCache = getRateLimitCacheStatus();
  console.log(
    `[ScraperHttpCache] Rate-limit cache initialized activeHosts=${rateLimitCache.activeHosts} cooldownMs=${rateLimitCache.cooldownMs} grouping=${rateLimitCache.grouping}`,
  );

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { response } = await cachedFetch(input, init, originalFetch);
    return response;
  };

  return () => {
    globalThis.fetch = originalFetch;
    installedOriginalFetch = null;
  };
}
