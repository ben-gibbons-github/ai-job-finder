import type { ScrapedJob } from './ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';

const WORKING_NOMADS_API_URL = 'https://www.workingnomads.com/api/exposed_jobs/';

interface WorkingNomadsJob {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function mapWorkingNomadsJob(job: WorkingNomadsJob): NormalizedPortalJob | null {
  const title = String(job.title ?? '').trim();
  const sourceUrl = String(job.url ?? '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const location = String(job.location ?? 'Remote').trim() || 'Remote';
  const tags = String(job.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title,
    company: String(job.company_name ?? 'Unknown Company').trim() || 'Unknown Company',
    location,
    remote: 'Remote',
    type: 'Unknown',
    sourceUrl,
    posted: String(job.pub_date ?? '').trim() || undefined,
    description: stripHtml(String(job.description ?? '')),
    tags: [String(job.category_name ?? '').trim(), ...tags, 'WorkingNomads'].filter(Boolean),
  };
}

export async function fetchAllWorkingNomadsJobs(): Promise<ScrapedJob[]> {
  try {
    const payload = await fetchJson(WORKING_NOMADS_API_URL);
    const jobs = Array.isArray(payload) ? (payload as WorkingNomadsJob[]) : [];
    const dedup = new Map<string, NormalizedPortalJob>();

    for (const job of jobs) {
      const mapped = mapWorkingNomadsJob(job);
      if (mapped) {
        dedup.set(mapped.sourceUrl, mapped);
      }
    }

    return normalizeJobsWithCoordinates('WorkingNomads', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[WorkingNomadsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}