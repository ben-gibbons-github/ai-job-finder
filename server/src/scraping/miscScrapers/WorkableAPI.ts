import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchPortalJobsFromEndpointList } from '../core/GenericEndpointPortalAPI.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

export async function fetchAllWorkableJobs(): Promise<ScrapedJob[]> {
  const direct = await fetchPortalJobsFromEndpointList({
    source: 'Workable',
    envVar: 'WORKABLE_FEED_ENDPOINTS',
  });

  if (direct.length > 0) {
    return direct;
  }

  return fetchPortalFallbackJobs('Workable', (url) => /apply\.workable\.com/i.test(url));
}
