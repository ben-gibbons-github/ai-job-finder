import type { ScrapedJob } from '../core/ScrapedJob.js';
import { getDiscoveredCompanySlugs } from '../core/CompanySlugDiscovery.js';
import { fetchPortalJobsFromEndpointList } from '../core/GenericEndpointPortalAPI.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

export async function fetchAllWorkableJobs(): Promise<ScrapedJob[]> {
  const boards = Array.from(new Set([
    ...parseCsvEnv(process.env.WORKABLE_BOARDS),
    ...getDiscoveredCompanySlugs('workable'),
  ]));
  const normalized: NormalizedPortalJob[] = [];

  for (const board of boards) {
    try {
      const payload = await fetchJson(`https://www.workable.com/api/accounts/${encodeURIComponent(board)}?details=true`) as {
        jobs?: Array<Record<string, unknown>>; openings?: Array<Record<string, unknown>>;
      };
      for (const job of payload.jobs ?? payload.openings ?? []) {
        const title = String(job.title ?? job.name ?? '').trim();
        const sourceUrl = String(job.url ?? job.apply_url ?? job.shortlink ?? '').trim();
        if (!title || !sourceUrl) continue;
        const location = typeof job.location === 'string' ? job.location : String((job.location as { title?: string } | undefined)?.title ?? 'Unknown');
        normalized.push({ title, company: String(job.company_name ?? board), location, remote: /remote/i.test(location) ? 'Remote' : 'Unknown', type: String(job.employment_type ?? job.type ?? 'Unknown'), sourceUrl, posted: String(job.published_at ?? job.created_at ?? '') || undefined, description: String(job.description ?? ''), tags: ['Workable'] });
      }
    } catch (error) {
      console.warn(`[WorkableAPI] Failed board ${board}:`, String(error));
    }
  }
  if (normalized.length > 0) return normalizeJobsWithCoordinates('Workable', normalized);

  const direct = await fetchPortalJobsFromEndpointList({
    source: 'Workable',
    envVar: 'WORKABLE_FEED_ENDPOINTS',
  });

  if (direct.length > 0) {
    return direct;
  }

  return fetchPortalFallbackJobs('Workable', (url) => /apply\.workable\.com/i.test(url));
}
