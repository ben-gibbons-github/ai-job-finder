import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hasRateLimitErrorMessage, isRateLimitedStatus } from './ScraperHttpErrors.js';
import {
  deleteScraperHttpCacheRow,
  getCacheDb,
  readScraperHttpCacheRow,
  upsertScraperHttpCacheRow,
} from '../../../database/CacheDatabase.js';
import { isSqlOnlyCacheLoadingEnabled } from '../../../utils/SqlOnlyCacheLoading.js';

const SCRAPER_HTTP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NETWORK_FAILURE_STATUS = 599;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_HTTP_CACHE_DIR = path.resolve(moduleDir, '../../../../cache/http');
let cachedDatabaseEntryCount: number | null = null;

export interface CachedHttpResponse {
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

function hashValue(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function getCacheFilePath(cacheKey: string): string {
  return path.join(SCRAPER_HTTP_CACHE_DIR, `${hashValue(cacheKey)}.json`);
}

function fromDatabaseRow(row: ReturnType<typeof readScraperHttpCacheRow>): CachedHttpResponse | null {
  if (!row) {
    return null;
  }

  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(row.headersJson) as Record<string, string>;
  } catch {
    return null;
  }

  return {
    cacheKey: row.cacheKey,
    url: row.url,
    method: row.method,
    status: row.status,
    statusText: row.statusText,
    headers,
    bodyText: row.bodyText,
    cachedAt: row.cachedAtMs,
    expiresAt: row.expiresAtMs,
    networkError: row.networkError,
    errorMessage: row.errorMessage || undefined,
  };
}

function toDatabaseRow(entry: CachedHttpResponse) {
  return {
    cacheKey: entry.cacheKey,
    url: entry.url,
    method: entry.method,
    status: entry.status,
    statusText: entry.statusText,
    headersJson: JSON.stringify(entry.headers || {}),
    bodyText: entry.bodyText,
    cachedAtMs: entry.cachedAt,
    expiresAtMs: entry.expiresAt,
    networkError: entry.networkError,
    errorMessage: entry.errorMessage || '',
  };
}

function isUsableCacheEntry(entry: CachedHttpResponse): boolean {
  return !entry.networkError
    && Number(entry.status || 0) !== NETWORK_FAILURE_STATUS
    && !isRateLimitedStatus(Number(entry.status || 0))
    && !hasRateLimitErrorMessage(entry.errorMessage)
    && Date.now() <= Number(entry.expiresAt || 0);
}

export async function getHttpCacheEntryCount(): Promise<number> {
  return getHttpCacheDatabaseEntryCount();
}

export function getHttpCacheDatabaseEntryCount(): number {
  if (cachedDatabaseEntryCount !== null) {
    return cachedDatabaseEntryCount;
  }

  cachedDatabaseEntryCount = Number(
    getCacheDb().prepare('SELECT COUNT(*) AS count FROM scraper_http_cache').get()?.count ?? 0,
  );
  return cachedDatabaseEntryCount;
}

export function toHeaderRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    record[key] = value;
  }
  return record;
}

function toHeadersInit(headers: Record<string, string>): HeadersInit {
  return Object.entries(headers || {});
}

export function normalizeMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return String(init.method).toUpperCase();
  if (input instanceof Request) return String(input.method || 'GET').toUpperCase();
  return 'GET';
}

async function readBodySignature(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const body = init?.body;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    const bytes = body instanceof Uint8Array ? body.length : body.byteLength;
    return `binary:${bytes}`;
  }
  if (body && typeof body === 'object') return String(body);
  if (input instanceof Request) {
    try {
      return await input.clone().text();
    } catch {
      return '';
    }
  }
  return '';
}

export function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export async function buildCacheKey(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const url = resolveUrl(input);
  const method = normalizeMethod(input, init);
  if (method === 'GET') return url;
  const signature = await readBodySignature(input, init);
  return `${url}::${method}::${hashValue(signature)}`;
}

export async function saveCacheEntry(entry: CachedHttpResponse): Promise<void> {
  const existed = readScraperHttpCacheRow(entry.cacheKey) !== null;
  upsertScraperHttpCacheRow(toDatabaseRow(entry));
  if (!existed && cachedDatabaseEntryCount !== null) {
    cachedDatabaseEntryCount += 1;
  }
}

export async function loadFreshCacheEntry(cacheKey: string): Promise<CachedHttpResponse | null> {
  const databaseEntry = fromDatabaseRow(readScraperHttpCacheRow(cacheKey));
  if (databaseEntry) {
    if (isUsableCacheEntry(databaseEntry)) {
      return databaseEntry;
    }
    deleteScraperHttpCacheRow(cacheKey);
    if (cachedDatabaseEntryCount !== null) {
      cachedDatabaseEntryCount = Math.max(0, cachedDatabaseEntryCount - 1);
    }
  }

  if (isSqlOnlyCacheLoadingEnabled()) {
    return null;
  }

  const filePath = getCacheFilePath(cacheKey);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as CachedHttpResponse;
    if (!parsed || parsed.cacheKey !== cacheKey) return null;
    if (!isUsableCacheEntry(parsed)) {
      return null;
    }
    upsertScraperHttpCacheRow(toDatabaseRow(parsed));
    if (cachedDatabaseEntryCount !== null) {
      cachedDatabaseEntryCount += 1;
    }
    console.log(
      `[ScraperHttpCache] Promoted JSON cache to database cacheKey=${parsed.cacheKey} status=${parsed.status} url=${parsed.url} cacheDbRows=${cachedDatabaseEntryCount ?? 'unknown'}`,
    );
    return parsed;
  } catch {
    return null;
  }
}

export function makeResponseFromCacheEntry(entry: CachedHttpResponse): Response {
  return new Response(entry.bodyText ?? '', {
    status: Math.max(200, Math.min(599, Number(entry.status) || NETWORK_FAILURE_STATUS)),
    statusText: entry.statusText || (entry.networkError ? 'Cached Network Failure' : 'Cached Response'),
    headers: toHeadersInit(entry.headers),
  });
}

export function shouldCacheUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function getCacheTtlMs(): number {
  return SCRAPER_HTTP_CACHE_TTL_MS;
}
