import path from 'node:path';
import { promises as fs, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';

import type { ScrapedJob } from '../core/ScrapedJob.js';
import { repairGenericCachedJobTitles } from '../miscScrapers/CacheJobTitleRepair.js';
import { buildScrapedJobKey } from '../core/JobKey.js';
import {
  recordDatabaseRead,
  recordHybridCacheFlow,
  recordDatabaseWrite,
  registerDatabasePath,
} from '../../utils/CacheIoTelemetry.js';
import { CACHE_DB_FILE } from '../../database/CacheDatabase.js';
import { decodeLegacyCachePayload } from '../../utils/LegacyCacheDecode.js';
import { isSqlOnlyCacheLoadingEnabled } from '../../utils/SqlOnlyCacheLoading.js';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(moduleDir, '../../../cache');
const SCRAPED_JOBS_DB_FILE = path.join(CACHE_DIR, 'scraped_jobs.sqlite');

registerDatabasePath(SCRAPED_JOBS_DB_FILE, 'sqlite', CACHE_DB_FILE);

let cacheDb: DatabaseSync | null = null;
let hasLoggedCacheAggregateSummary = false;

function isDatabaseMalformedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const errcode = (error as { errcode?: unknown }).errcode;
  const message = String(error.message || '').toLowerCase();
  return errcode === 11 || message.includes('malformed') || message.includes('database disk image');
}

function quarantineCorruptDatabaseFiles(): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const suffix of ['', '-wal', '-shm']) {
    const src = `${SCRAPED_JOBS_DB_FILE}${suffix}`;
    const dest = `${SCRAPED_JOBS_DB_FILE}.corrupt-${stamp}${suffix}`;
    try {
      renameSync(src, dest);
    } catch {
      // Missing files (e.g. no WAL yet) are fine.
    }
  }
  console.error(
    `[ScrapedJobsDb] Database disk image is malformed; quarantined cache DB to scraped_jobs.sqlite.corrupt-${stamp}* and rebuilt a fresh cache. Legacy JSON caches will re-hydrate on demand.`,
  );
}

function openCacheDb(): DatabaseSync {
  const db = new DatabaseSync(SCRAPED_JOBS_DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_jobs (
      component_name TEXT NOT NULL,
      job_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY(component_name, job_key)
    );

    CREATE INDEX IF NOT EXISTS idx_scraped_jobs_component
    ON scraped_jobs(component_name);

    CREATE TABLE IF NOT EXISTS component_cache_state (
      component_name TEXT PRIMARY KEY,
      updated_at_ms INTEGER NOT NULL
    );
  `);
  return db;
}

function getCacheDb(): DatabaseSync {
  if (cacheDb) {
    return cacheDb;
  }

  const db = openCacheDb();
  try {
    // Canary probe: this is the first query startup runs; corruption surfaces here.
    db.prepare('SELECT COUNT(*) AS count FROM scraped_jobs').get();
  } catch (error) {
    if (!isDatabaseMalformedError(error)) {
      throw error;
    }
    try {
      db.close();
    } catch {
      // Ignore close failures on a corrupt handle.
    }
    quarantineCorruptDatabaseFiles();
    cacheDb = openCacheDb();
    return cacheDb;
  }

  cacheDb = db;
  return db;
}

function logScrapedJobCacheAggregateSummary(label: string): void {
  try {
    const db = getCacheDb();
    const totalRows = Number(db.prepare('SELECT COUNT(*) AS count FROM scraped_jobs').get()?.count ?? 0);
    const componentSummary = db.prepare(
      'SELECT component_name, COUNT(*) AS count FROM scraped_jobs GROUP BY component_name ORDER BY count DESC LIMIT 10',
    ).all() as Array<{ component_name: string; count: number }>;
    const rows = db.prepare('SELECT payload_json FROM scraped_jobs').all() as Array<{ payload_json: string }>;

    const uniqueSourceUrls = new Set<string>();
    let missingSourceUrlCount = 0;

    for (const row of rows) {
      try {
        const job = JSON.parse(String(row.payload_json ?? '{}')) as { source_url?: unknown };
        const sourceUrl = typeof job.source_url === 'string' ? job.source_url.trim() : '';
        if (sourceUrl) {
          uniqueSourceUrls.add(sourceUrl);
        } else {
          missingSourceUrlCount += 1;
        }
      } catch {
        missingSourceUrlCount += 1;
      }
    }

    const distinctComponents = Number(
      db.prepare('SELECT COUNT(DISTINCT component_name) AS count FROM scraped_jobs').get()?.count ?? 0,
    );
    const topComponents = componentSummary.map((entry) => `${entry.component_name}=${entry.count}`).join(', ');

    console.log(
      `[CacheAggregate] ${label}: totalRows=${totalRows} distinctComponents=${distinctComponents} uniqueSourceUrls=${uniqueSourceUrls.size} missingSourceUrl=${missingSourceUrlCount} topComponents=${topComponents}`,
    );
  } catch (error) {
    console.warn(`[CacheAggregate] ${label}: failed to summarize scraped job cache: ${String(error)}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLegacyCachePattern(componentName: string): RegExp {
  return new RegExp(`^${escapeRegExp(componentName)}(?:_(\\d+))?\\.json$`);
}

function parseShardOrder(fileName: string): number {
  const shardMatch = fileName.match(/_(\d+)\.json$/);
  if (!shardMatch) {
    return 0;
  }

  const parsed = Number(shardMatch[1]);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function toScrapedJobs(value: unknown): ScrapedJob[] {
  return Array.isArray(value) ? (value as ScrapedJob[]) : [];
}

function dedupeJobsByKey(jobs: ScrapedJob[]): ScrapedJob[] {
  const mergedByKey = new Map<string, ScrapedJob>();
  for (const job of jobs) {
    mergedByKey.set(buildScrapedJobKey(job), job);
  }
  return Array.from(mergedByKey.values());
}

async function writeCacheWithTimestamp(
  componentName: string,
  jobs: ScrapedJob[],
  updatedAtMs: number,
  writeMode: 'direct' | 'hydrate' = 'direct',
): Promise<void> {
  const db = getCacheDb();
  recordDatabaseWrite(SCRAPED_JOBS_DB_FILE);
  recordHybridCacheFlow(SCRAPED_JOBS_DB_FILE, writeMode === 'hydrate' ? 'db-hydrate-write' : 'db-direct-write');

  const dedupedJobs = dedupeJobsByKey(jobs);
  const maxAttempts = 5;

  console.log(
    `[ScrapedJobsDb] Saving component=${componentName} mode=${writeMode} ` +
    `incoming=${jobs.length} deduped=${dedupedJobs.length} strategy=insert-new-rows-only`,
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let transactionOpened = false;
    try {
      db.exec('BEGIN IMMEDIATE;');
      transactionOpened = true;

      // Only add net-new job_keys; existing rows are left untouched to avoid a full delete+reinsert on every checkpoint.
      const existingKeyRows = db.prepare(
        'SELECT job_key FROM scraped_jobs WHERE component_name = ?',
      ).all(componentName) as Array<{ job_key: string }>;
      const existingKeys = new Set(existingKeyRows.map((row) => row.job_key));

      const insertStmt = db.prepare(`
        INSERT INTO scraped_jobs (component_name, job_key, payload_json, updated_at_ms)
        VALUES (?, ?, ?, ?)
      `);

      let insertedCount = 0;
      for (const job of dedupedJobs) {
        const jobKey = buildScrapedJobKey(job);
        if (existingKeys.has(jobKey)) {
          continue;
        }
        insertStmt.run(componentName, jobKey, JSON.stringify(job), updatedAtMs);
        insertedCount += 1;
      }

      const upsertStateStmt = db.prepare(`
        INSERT INTO component_cache_state(component_name, updated_at_ms)
        VALUES (?, ?)
        ON CONFLICT(component_name)
        DO UPDATE SET updated_at_ms = excluded.updated_at_ms
      `);
      upsertStateStmt.run(componentName, updatedAtMs);

      db.exec('COMMIT;');
      console.log(
        `[ScrapedJobsDb] Saved component=${componentName} mode=${writeMode} ` +
        `existing=${existingKeys.size} inserted=${insertedCount} updatedAtMs=${updatedAtMs}`,
      );
      return;
    } catch (error) {
      if (transactionOpened) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Ignore rollback errors from transactions that never opened fully.
        }
      }

      if (isDatabaseLockedError(error) && attempt < maxAttempts) {
        await delay(125 * attempt);
        continue;
      }

      throw error;
    }
  }
}

function isDatabaseLockedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = String(error.message || '').toLowerCase();
  return message.includes('database is locked') || message.includes('database is busy');
}

function readComponentJobsFromSqlite(componentName: string): ScrapedJob[] | null {
  const db = getCacheDb();
  const rows = db.prepare(
    'SELECT payload_json FROM scraped_jobs WHERE component_name = ? ORDER BY rowid ASC',
  ).all(componentName) as Array<{ payload_json: string }>;

  if (!Array.isArray(rows) || rows.length === 0) {
    recordDatabaseRead(SCRAPED_JOBS_DB_FILE, false);
    recordHybridCacheFlow(SCRAPED_JOBS_DB_FILE, 'db-read-miss');
    console.log(`[CacheRead] ${componentName}: dbRows=0 uniqueJobs=0`);
    return null;
  }

  const jobs: ScrapedJob[] = [];
  for (const row of rows) {
    try {
      jobs.push(JSON.parse(String(row.payload_json ?? '{}')) as ScrapedJob);
    } catch {
      // Skip malformed rows and keep the rest of the cache usable.
    }
  }

  if (jobs.length === 0) {
    recordDatabaseRead(SCRAPED_JOBS_DB_FILE, false);
    recordHybridCacheFlow(SCRAPED_JOBS_DB_FILE, 'db-read-miss');
    console.log(`[CacheRead] ${componentName}: dbRows=${rows.length} parsedJobs=0 uniqueJobs=0`);
    return null;
  }

  recordDatabaseRead(SCRAPED_JOBS_DB_FILE, true);
  recordHybridCacheFlow(SCRAPED_JOBS_DB_FILE, 'db-read-hit');

  const repaired = repairGenericCachedJobTitles(componentName, jobs);
  const uniqueJobs = dedupeJobsByKey(repaired.jobs);
  console.log(
    `[CacheRead] ${componentName}: dbRows=${rows.length} parsedJobs=${jobs.length} uniqueJobs=${uniqueJobs.length} afterCollapse=${uniqueJobs.length}`,
  );

  if (repaired.correctedCount > 0) {
    console.log(`[CacheRepair] ${componentName}: corrected ${repaired.correctedCount} generic cached job titles`);
  }

  return uniqueJobs;
}

async function readLegacyCache(componentName: string): Promise<{ jobs: ScrapedJob[]; updatedAtMs: number | null } | null> {
  let fileNames: string[] = [];
  try {
    fileNames = await fs.readdir(CACHE_DIR);
  } catch {
    return null;
  }

  const pattern = buildLegacyCachePattern(componentName);
  const legacyFiles = fileNames
    .filter((name) => pattern.test(name))
    .sort((a, b) => parseShardOrder(a) - parseShardOrder(b));

  if (legacyFiles.length === 0) {
    return null;
  }

  const legacyJobs: ScrapedJob[] = [];
  let latestMtimeMs = 0;

  for (const fileName of legacyFiles) {
    const filePath = path.join(CACHE_DIR, fileName);

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(decodeLegacyCachePayload(raw)) as unknown;
      const shardJobs = toScrapedJobs(parsed);
      for (const job of shardJobs) {
        legacyJobs.push(job);
      }

      const stat = await fs.stat(filePath).catch(() => null);
      if (stat && Number.isFinite(stat.mtimeMs)) {
        latestMtimeMs = Math.max(latestMtimeMs, stat.mtimeMs);
      }
    } catch (error) {
      console.warn(`[ScrapedJobsDb] Failed reading legacy cache shard ${fileName}: ${String(error)}`);
    }
  }

  if (legacyJobs.length === 0) {
    return null;
  }

  const dedupedLegacyJobs = dedupeJobsByKey(legacyJobs);
  const repaired = repairGenericCachedJobTitles(componentName, dedupedLegacyJobs);
  console.log(
    `[LegacyCacheLoad] ${componentName}: legacyShardRows=${legacyJobs.length} deduped=${dedupedLegacyJobs.length} repaired=${repaired.jobs.length}`,
  );

  if (repaired.correctedCount > 0) {
    console.log(`[CacheRepair] ${componentName}: corrected ${repaired.correctedCount} generic cached job titles`);
  }

  return {
    jobs: repaired.jobs,
    updatedAtMs: latestMtimeMs > 0 ? latestMtimeMs : null,
  };
}

async function hydrateSqliteFromLegacyCache(componentName: string): Promise<{ jobs: ScrapedJob[]; updatedAtMs: number | null } | null> {
  if (isSqlOnlyCacheLoadingEnabled()) {
    return null;
  }

  const legacy = await readLegacyCache(componentName);
  if (!legacy) {
    return null;
  }

  const hydrateTimestamp = legacy.updatedAtMs ?? Date.now();
  try {
    recordHybridCacheFlow(SCRAPED_JOBS_DB_FILE, 'legacy-read-hit');
    await writeCacheWithTimestamp(componentName, legacy.jobs, hydrateTimestamp, 'hydrate');
    console.log(`[ScrapedJobsDb] Hydrated ${legacy.jobs.length} legacy cached jobs for ${componentName} into SQLite`);
  } catch (error) {
    console.warn(`[ScrapedJobsDb] Failed to hydrate SQLite from legacy cache for ${componentName}: ${String(error)}`);
  }

  return legacy;
}

function getComponentUpdatedAtMs(componentName: string): number | null {
  const db = getCacheDb();
  const row = db.prepare(
    'SELECT updated_at_ms FROM component_cache_state WHERE component_name = ?',
  ).get(componentName) as { updated_at_ms?: number } | undefined;

  if (!row || !Number.isFinite(Number(row.updated_at_ms))) {
    recordDatabaseRead(SCRAPED_JOBS_DB_FILE, false);
    recordHybridCacheFlow(SCRAPED_JOBS_DB_FILE, 'db-read-miss');
    return null;
  }

  recordDatabaseRead(SCRAPED_JOBS_DB_FILE, true);
  recordHybridCacheFlow(SCRAPED_JOBS_DB_FILE, 'db-read-hit');

  return Number(row.updated_at_ms);
}

export function getFreshCacheAge(componentName: string): { ageMs: number; refreshInMs: number; ttlMs: number } | null {
  const updatedAtMs = getComponentUpdatedAtMs(componentName);
  if (!updatedAtMs) {
    return null;
  }

  const ageMs = Math.max(0, Date.now() - updatedAtMs);
  return {
    ageMs,
    refreshInMs: Math.max(0, CACHE_TTL_MS - ageMs),
    ttlMs: CACHE_TTL_MS,
  };
}

export async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  getCacheDb();

  if (!hasLoggedCacheAggregateSummary) {
    hasLoggedCacheAggregateSummary = true;
    logScrapedJobCacheAggregateSummary('startup');
  }
}

export async function readFreshCache(componentName: string): Promise<ScrapedJob[] | null> {
  await ensureCacheDir();

  const sqliteUpdatedAtMs = getComponentUpdatedAtMs(componentName);
  if (sqliteUpdatedAtMs) {
    const sqliteCacheAgeMs = Date.now() - sqliteUpdatedAtMs;
    if (sqliteCacheAgeMs <= CACHE_TTL_MS) {
      const sqliteJobs = readComponentJobsFromSqlite(componentName);
      if (sqliteJobs) {
        return sqliteJobs;
      }
    }
  }

  const legacy = await hydrateSqliteFromLegacyCache(componentName);
  if (!legacy) {
    return null;
  }

  const legacyUpdatedAtMs = legacy.updatedAtMs ?? 0;
  const legacyCacheAgeMs = Date.now() - legacyUpdatedAtMs;
  if (legacyUpdatedAtMs > 0 && legacyCacheAgeMs > CACHE_TTL_MS) {
    return null;
  }

  return legacy.jobs;
}

export async function readAnyCache(componentName: string): Promise<ScrapedJob[] | null> {
  await ensureCacheDir();

  const sqliteCached = readComponentJobsFromSqlite(componentName);
  if (sqliteCached) {
    return sqliteCached;
  }

  const legacy = await hydrateSqliteFromLegacyCache(componentName);
  return legacy?.jobs ?? null;
}

export async function writeCache(componentName: string, jobs: ScrapedJob[]): Promise<void> {
  await ensureCacheDir();
  await writeCacheWithTimestamp(componentName, jobs, Date.now());
}

export async function hydrateAllLegacyScrapedJobsToDatabase(): Promise<{ componentsHydrated: number; rowsHydrated: number }> {
  await ensureCacheDir();

  let fileNames: string[] = [];
  try {
    fileNames = await fs.readdir(CACHE_DIR);
  } catch {
    return { componentsHydrated: 0, rowsHydrated: 0 };
  }

  const skipFiles = new Set([
    'scrapedemployers.json',
    'locationsearch.json',
    'locations.json',
    'llmanswers.json',
    'cachesNeedUpdating.json',
  ]);

  const componentNames = new Set<string>();
  for (const fileName of fileNames) {
    if (!fileName.toLowerCase().endsWith('.json')) {
      continue;
    }
    if (skipFiles.has(fileName)) {
      continue;
    }
    const withoutExt = fileName.slice(0, -5);
    const match = withoutExt.match(/^(.*?)(?:_\d+)?$/);
    const componentName = String(match?.[1] ?? '').trim();
    if (componentName) {
      componentNames.add(componentName);
    }
  }

  let componentsHydrated = 0;
  let rowsHydrated = 0;
  for (const componentName of componentNames) {
    const legacy = await readLegacyCache(componentName);
    if (!legacy || legacy.jobs.length === 0) {
      continue;
    }
    const hydrateTimestamp = legacy.updatedAtMs ?? Date.now();
    await writeCacheWithTimestamp(componentName, legacy.jobs, hydrateTimestamp, 'hydrate');
    componentsHydrated += 1;
    rowsHydrated += legacy.jobs.length;
  }

  return { componentsHydrated, rowsHydrated };
}
