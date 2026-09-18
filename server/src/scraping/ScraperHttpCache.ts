import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  getCurrentScraperSource,
  recordUrlCacheHit,
  recordUrlCacheMiss,
} from './ScrapeDebugTelemetry.js';

const SCRAPER_HTTP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NETWORK_FAILURE_STATUS = 599;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_HTTP_CACHE_DIR = path.resolve(moduleDir, '../../cache/http');

interface CachedHttpResponse {
  cacheKey: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  cachedAt: number;
  expiresAt: number;
  networkError: boolean;
  errorMessage?: string;
}

export class RateLimitedScrapeError extends Error {
  status: number;
  url: string;
  method: string;

  constructor(status: number, url: string, method: string) {
    super(`Rate limited (${status}) for ${method} ${url}`);
    this.name = 'RateLimitedScrapeError';
    this.status = status;
    this.url = url;
    this.method = method;
  }
}

export function isRateLimitedScrapeError(error: unknown): error is RateLimitedScrapeError {
  return error instanceof RateLimitedScrapeError;
}

function hasRateLimitErrorMessage(value: string | undefined): boolean {
  return /Rate limited \(|RateLimitedScrapeError/i.test(value || '');
}

function isRateLimitedStatus(status: number): boolean {
  return status === 429 || status === 403;
}

function isRateLimitedErrorMessage(message: string): boolean {
  return /Rate limited/i.test(message || '');
}

function hashValue(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function getCacheFilePath(cacheKey: string): string {
  const hash = hashValue(cacheKey);
  return path.join(SCRAPER_HTTP_CACHE_DIR, `${hash}.json`);
}

function toHeaderRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    record[key] = value;
  }
  return record;
}

function toHeadersInit(headers: Record<string, string>): HeadersInit {
  return Object.entries(headers || {});
}

function normalizeMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return String(init.method).toUpperCase();
  }

  if (input instanceof Request) {
    return String(input.method || 'GET').toUpperCase();
  }

  return 'GET';
}

async function readBodySignature(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const body = init?.body;
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    const bytes = body instanceof Uint8Array ? body.length : body.byteLength;
    return `binary:${bytes}`;
  }

  if (body && typeof body === 'object') {
    return String(body);
  }

  if (input instanceof Request) {
    try {
      const cloned = input.clone();
      return await cloned.text();
    } catch {
      return '';
    }
  }

  return '';
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

async function buildCacheKey(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const url = resolveUrl(input);
  const method = normalizeMethod(input, init);

  // URL-only key for GET requests. For non-GET requests, include a body signature
  // to prevent unrelated POST/PUT payloads from colliding on the same endpoint URL.
  if (method === 'GET') {
    return url;
  }

  const signature = await readBodySignature(input, init);
  return `${url}::${method}::${hashValue(signature)}`;
}

async function saveCacheEntry(entry: CachedHttpResponse): Promise<void> {
  const filePath = getCacheFilePath(entry.cacheKey);
  await fs.mkdir(SCRAPER_HTTP_CACHE_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entry), 'utf8');
}

async function loadFreshCacheEntry(cacheKey: string): Promise<CachedHttpResponse | null> {
  const filePath = getCacheFilePath(cacheKey);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as CachedHttpResponse;
    if (!parsed || parsed.cacheKey !== cacheKey) {
      return null;
    }

    // Rate-limit responses should never be served from cache.
    if (
      isRateLimitedStatus(Number(parsed.status || 0)) ||
      hasRateLimitErrorMessage(parsed.errorMessage)
    ) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }

    if (Date.now() > Number(parsed.expiresAt || 0)) {
      await fs.unlink(filePath).catch(() => {});
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function makeResponseFromCacheEntry(entry: CachedHttpResponse): Response {
  return new Response(entry.bodyText ?? '', {
    status: Math.max(200, Math.min(599, Number(entry.status) || NETWORK_FAILURE_STATUS)),
    statusText: entry.statusText || (entry.networkError ? 'Cached Network Failure' : 'Cached Response'),
    headers: toHeadersInit(entry.headers),
  });
}

function shouldCacheUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function cachedFetch(input: RequestInfo | URL, init?: RequestInit, originalFetch = globalThis.fetch.bind(globalThis)): Promise<Response> {
  const url = resolveUrl(input);
  if (!shouldCacheUrl(url)) {
    return originalFetch(input, init);
  }

  const cacheKey = await buildCacheKey(input, init);
  const cached = await loadFreshCacheEntry(cacheKey);
  if (cached) {
    recordUrlCacheHit(getCurrentScraperSource());
    console.log(
      `[ScraperHttpCache] HIT method=${cached.method} status=${cached.status} url=${cached.url}`,
    );
    if (cached.networkError) {
      throw new Error(cached.errorMessage || `[ScraperHttpCache] Cached network failure for ${url}`);
    }
    return makeResponseFromCacheEntry(cached);
  }

  recordUrlCacheMiss(getCurrentScraperSource());
  console.log(
    `[ScraperHttpCache] MISS method=${normalizeMethod(input, init)} url=${url}`,
  );

  try {
    const response = await originalFetch(input, init);
    const responseBody = await response.clone().text().catch(() => '');
    const method = normalizeMethod(input, init);

    if (isRateLimitedStatus(response.status)) {
      console.log(
        `[ScraperHttpCache] BYPASS rate-limited response method=${method} status=${response.status} url=${url}`,
      );
      throw new RateLimitedScrapeError(response.status, url, method);
    }

    const now = Date.now();
    const entry: CachedHttpResponse = {
      cacheKey,
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      headers: toHeaderRecord(response.headers),
      bodyText: responseBody,
      cachedAt: now,
      expiresAt: now + SCRAPER_HTTP_CACHE_TTL_MS,
      networkError: false,
    };

    await saveCacheEntry(entry);
    return response;
  } catch (error) {
    if (isRateLimitedScrapeError(error)) {
      throw error;
    }

    const now = Date.now();
    const entry: CachedHttpResponse = {
      cacheKey,
      url,
      method: normalizeMethod(input, init),
      status: NETWORK_FAILURE_STATUS,
      statusText: 'Network Failure',
      headers: {},
      bodyText: '',
      cachedAt: now,
      expiresAt: now + SCRAPER_HTTP_CACHE_TTL_MS,
      networkError: true,
      errorMessage: String(error),
    };

    await saveCacheEntry(entry);
    throw error;
  }
}

export async function scraperFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return cachedFetch(input, init);
}

export function installScraperHttpCache(): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return cachedFetch(input, init, originalFetch);
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}