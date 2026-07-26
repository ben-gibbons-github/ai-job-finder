import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ScrapedJob } from './ScrapedJob.js';
import { repairGenericCachedJobTitles } from './CacheJobTitleRepair.js';
import { CacheHandler } from '../utils/CacheHandler.js';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(moduleDir, '../../cache');

function cacheFilePath(componentName: string): string {
  return path.join(CACHE_DIR, `${componentName}.json`);
}

const cacheHandlers = new Map<string, CacheHandler>();

function getCacheHandler(componentName: string): CacheHandler {
  const existing = cacheHandlers.get(componentName);
  if (existing) {
    return existing;
  }

  const created = new CacheHandler(cacheFilePath(componentName));
  cacheHandlers.set(componentName, created);
  return created;
}

export async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function readFreshCache(componentName: string): Promise<ScrapedJob[] | null> {
  const filePath = cacheFilePath(componentName);
  const cacheHandler = getCacheHandler(componentName);

  try {
    const stat = await fs.stat(filePath);
    const cacheAgeMs = Date.now() - stat.mtimeMs;

    if (cacheAgeMs > CACHE_TTL_MS) {
      return null;
    }

    const parsed = await cacheHandler.loadWithFallback((raw) => JSON.parse(raw) as unknown);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const repaired = repairGenericCachedJobTitles(componentName, parsed as ScrapedJob[]);
    if (repaired.correctedCount > 0) {
      console.log(`[CacheRepair] ${componentName}: corrected ${repaired.correctedCount} generic cached job titles`);
    }

    return repaired.jobs;
  } catch {
    return null;
  }
}

export async function readAnyCache(componentName: string): Promise<ScrapedJob[] | null> {
  const cacheHandler = getCacheHandler(componentName);

  try {
    const parsed = await cacheHandler.loadWithFallback((raw) => JSON.parse(raw) as unknown);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const repaired = repairGenericCachedJobTitles(componentName, parsed as ScrapedJob[]);
    if (repaired.correctedCount > 0) {
      console.log(`[CacheRepair] ${componentName}: corrected ${repaired.correctedCount} generic cached job titles`);
    }

    return repaired.jobs;
  } catch {
    return null;
  }
}

export async function writeCache(componentName: string, jobs: ScrapedJob[]): Promise<void> {
  const cacheHandler = getCacheHandler(componentName);
  await cacheHandler.save(JSON.stringify(jobs, null, 2));
}
