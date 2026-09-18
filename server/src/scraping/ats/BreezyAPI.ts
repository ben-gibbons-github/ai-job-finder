import type { ScrapedJob } from '../core/ScrapedJob.js';
import { getDiscoveredCompanySlugs } from '../core/CompanySlugDiscovery.js';
import { fetchPortalJobsFromEndpointList } from '../core/GenericEndpointPortalAPI.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

export async function fetchAllBreezyJobs(): Promise<ScrapedJob[]> {
  const boards = Array.from(new Set([
    ...parseCsvEnv(process.env.BREEZY_BOARDS),
    ...getDiscoveredCompanySlugs('breezy'),
  ]));
  const normalized: NormalizedPortalJob[] = [];

  for (const board of boards) {
    try {
      const payload = await fetchJson(`https://${encodeURIComponent(board)}.breezy.hr/json`) as {
        positions?: Array<Record<string, unknown>>; jobs?: Array<Record<string, unknown>>;
      };
      for (const job of payload.positions ?? payload.jobs ?? []) {
        const title = String(job.name ?? job.title ?? '').trim();
        const sourceUrl = String(job.url ?? job.apply_url ?? '').trim();
        if (!title || !sourceUrl) continue;
        const location = String(job.location_name ?? job.location ?? 'Unknown');
        normalized.push({ title, company: String(job.company_name ?? board), location, remote: /remote/i.test(location) ? 'Remote' : 'Unknown', type: String(job.type ?? 'Unknown'), sourceUrl, posted: String(job.created_date ?? job.created_at ?? '') || undefined, description: String(job.description ?? ''), tags: ['Breezy'] });
      }
    } catch (error) {
      console.warn(`[BreezyAPI] Failed board ${board}:`, String(error));
    }
  }
  if (normalized.length > 0) return normalizeJobsWithCoordinates('Breezy', normalized);

  const direct = await fetchPortalJobsFromEndpointList({
    source: 'Breezy',
    envVar: 'BREEZY_FEED_ENDPOINTS',
  });

  if (direct.length > 0) {
    return direct;
  }

  return fetchPortalFallbackJobs('Breezy', (url) => /breezy\.hr/i.test(url));
}
