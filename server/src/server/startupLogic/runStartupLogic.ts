import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { scrapeJobsMain } from '../../scraping/core/main/ScrapeJobMain.js';
import { getSearchSuggestionCount, rebuildSearchSuggestions } from '../../searching/searchSuggestions/SearchSuggestion.js';
import { sortJobsByCompanyQuality } from '../../searching/SearchUtils.js';
import { warmLlmAnswerCache } from '../../llms/LLMCache.js';
import { warmLocationSearchCache } from '../../searching/locationSearch/LocationSearchCache.js';
import { getCacheSize as getLocationLatLonCacheSize, initializeCache as initializeLocationLatLonCache } from '../../utils/NameToLonLatCache.js';
import { buildTagCloud } from '../TagCloud.js';
import type { TagCloudEntry } from '../TagCloud.js';
import { computeServerDebugCoverageStats } from '../../utils/debugStats/DebugStats.js';
import { startEventLoopLagMonitor } from '../../utils/EventLoopLagMonsitor.js';
import { startBackgroundEmployerClassification } from '../../utils/BackgroundEmployerClassification.js';
import { logQualityExtremes } from './logQualityExtremes.js';
import { startTimer } from './startTimer.js';
import { warmHaystackAsync } from './warmHaystackAsync.js';
import type { RunStartupLogicOptions, StartupLogicResult } from './types.js';

export async function runStartupLogic(options: RunStartupLogicOptions): Promise<StartupLogicResult> {
  const {
    searchMain,
    top100Search,
    searchDebugEnabled,
    haystackWarmupEnabled,
    onScrapeProgress,
  } = options;

  startEventLoopLagMonitor();

  const cacheDir = path.resolve(import.meta.dirname, '../../../cache');
  if (existsSync(cacheDir)) {
    const files = readdirSync(cacheDir);
    const totalBytes = files.reduce((sum, fileName) => {
      try {
        return sum + statSync(path.join(cacheDir, fileName)).size;
      } catch {
        return sum;
      }
    }, 0);
    console.log(`[Cache] ${cacheDir} — ${files.length} file(s), ${(totalBytes / 1_048_576).toFixed(1)} MB`);
  } else {
    console.warn(`[Cache] Directory not found: ${cacheDir}`);
  }

  const sideEffectLoads = await Promise.all([
    import('../../scraping/core/ScrapedEmployerCache.js'),
  ]);

  const llmRows = await warmLlmAnswerCache();
  const locationSearchQueries = await warmLocationSearchCache();
  await initializeLocationLatLonCache();

  const scrapedEmployerCacheModule = sideEffectLoads[0] as { default?: { size?: number } };
  const scrapedEmployerCount = Number(scrapedEmployerCacheModule.default?.size ?? 0);
  const locationLatLonCount = getLocationLatLonCacheSize();

  console.log(
    `[Startup] Cache warmup complete -> ` +
    `llm_answer_cache=${llmRows} | ` +
    `location_search_cache(queries)=${locationSearchQueries} | ` +
    `location_latlon_cache=${locationLatLonCount} | ` +
    `scraped_employer_cache=${scrapedEmployerCount}`,
  );

  const startupData = await scrapeJobsMain({ onProgress: onScrapeProgress });
  const jobs = startupData.jobs;
  const scrapeLoadDebugStats = startupData.scrapeLoadDebugStats;
  const debugCoverageStats = searchDebugEnabled && scrapeLoadDebugStats
    ? computeServerDebugCoverageStats(jobs, scrapeLoadDebugStats)
    : null;
  console.log(`Loaded ${jobs.length} jobs at startup.`);

  searchMain.clearCache();
  top100Search.clearCache();
  console.log('[Startup] Cleared search caches after loading the complete job corpus.');

  const doneSortQuality = startTimer(`sortJobsByCompanyQuality (${jobs.length} jobs)`);
  sortJobsByCompanyQuality(jobs);
  doneSortQuality();
  console.log('[Startup] Jobs sorted by quality score.');
  logQualityExtremes(jobs, 10);

  const doneSearchSuggestions = startTimer(`rebuildSearchSuggestions (${jobs.length} jobs)`);
  rebuildSearchSuggestions(jobs);
  doneSearchSuggestions();
  console.log(`Built search suggestion index with ${getSearchSuggestionCount()} unique terms.`);

  if (haystackWarmupEnabled) {
    warmHaystackAsync(jobs);
  } else {
    console.log('[Haystack] Warmup skipped (HAYSTACK_WARMUP_ENABLED not set) — cache will build lazily on first search.');
  }

  let cachedTagCloud: TagCloudEntry[] = [];
  if (process.env.TAG_CLOUD_WARMUP_ENABLED === 'true') {
    const doneTagCloud = startTimer(`buildTagCloud (${jobs.length} jobs, top 500)`);
    cachedTagCloud = buildTagCloud(jobs, 500);
    doneTagCloud();
    console.log(`Built tag cloud with ${cachedTagCloud.length} entries.`);
  } else {
    console.log('[TagCloud] Warmup skipped (TAG_CLOUD_WARMUP_ENABLED not set) — cache will build lazily.');
  }

  const doneTop100 = startTimer('top100Search.refresh');
  const cached = await top100Search.refresh(jobs);
  doneTop100();
  console.log(`Built default cached search results: ${cached.results.length}/${cached.total}`);

  startBackgroundEmployerClassification(jobs);

  return {
    jobs,
    scrapeLoadDebugStats,
    debugCoverageStats,
    cachedTagCloud,
  };
}
