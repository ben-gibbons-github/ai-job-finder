import type { ScrapedJob } from '../core/ScrapedJob.js';
import { getDiscoveredCompanySlugs } from '../core/CompanySlugDiscovery.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';

interface RipplingJob {
  id?: string;
  title?: string;
  name?: string;
  location?: string | { name?: string };
  description?: string;
  employment_type?: string;
  job_type?: string;
  url?: string;
  apply_url?: string;
  created_at?: string;
}

function getJobs(payload: unknown): RipplingJob[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as { jobs?: unknown; data?: { jobs?: unknown } };
  return Array.isArray(root.jobs) ? root.jobs as RipplingJob[] : Array.isArray(root.data?.jobs) ? root.data.jobs as RipplingJob[] : [];
}

export async function fetchAllRipplingJobs(): Promise<ScrapedJob[]> {
  const configured = parseCsvEnv(process.env.RIPPLING_BOARDS);
  const boards = Array.from(new Set([...configured, ...getDiscoveredCompanySlugs('rippling')]));
  const normalized: NormalizedPortalJob[] = [];

  for (const board of boards) {
    try {
      const payload = await fetchJson(`https://api.rippling.com/platform/api/job_boards/${encodeURIComponent(board)}/jobs`);
      for (const job of getJobs(payload)) {
        const title = String(job.title ?? job.name ?? '').trim();
        if (!title) continue;
        const location = typeof job.location === 'string' ? job.location : job.location?.name || 'Unknown';
        normalized.push({
          title,
          company: board,
          location,
          remote: /remote/i.test(location) ? 'Remote' : 'Unknown',
          type: String(job.employment_type ?? job.job_type ?? 'Unknown'),
          sourceUrl: String(job.apply_url ?? job.url ?? `https://ats.rippling.com/${board}/jobs/${job.id ?? ''}`),
          posted: job.created_at,
          description: String(job.description ?? ''),
          tags: ['Rippling'],
        });
      }
    } catch (error) {
      console.warn(`[RipplingAPI] Failed board ${board}:`, String(error));
    }
  }

  return normalizeJobsWithCoordinates('Rippling', normalized);
}