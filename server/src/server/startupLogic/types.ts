import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';
import type SearchMain from '../../searching/searchMain/SearchMain.js';
import type { Top100Search } from '../../searching/Top100Search.js';
import type { ScrapeLoadDebugStats } from '../../scraping/core/ScrapeDebugTelemetry.js';
import type { ScrapeJobsProgress } from '../../scraping/core/main/scrapeTypes.js';
import type { TagCloudEntry } from '../TagCloud.js';
import type { ServerDebugCoverageStats } from '../../utils/debugStats/DebugStats.js';

export interface StartupLogicResult {
  jobs: ScrapedJob[];
  scrapeLoadDebugStats: ScrapeLoadDebugStats | null;
  debugCoverageStats: ServerDebugCoverageStats | null;
  cachedTagCloud: TagCloudEntry[];
}

export interface RunStartupLogicOptions {
  searchMain: SearchMain;
  top100Search: Top100Search;
  searchDebugEnabled: boolean;
  haystackWarmupEnabled: boolean;
  onScrapeProgress?: (progress: ScrapeJobsProgress) => void;
}
