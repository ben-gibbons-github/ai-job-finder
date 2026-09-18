import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const REMOTIVE_API_URL = 'https://remotive.com/api/remote-jobs';

interface RemotiveJob {
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  category?: string;
  job_type?: string;
  url?: string;
  publication_date?: string;
  description?: string;
  tags?: string[];
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

function mapRemotiveJob(job: RemotiveJob): NormalizedPortalJob | null {
  const title = String(job.title ?? '').trim();
  const sourceUrl = String(job.url ?? '').trim();

  if (!title || !sourceUrl) {
    return null;
  }

  const location = String(job.candidate_required_location ?? '').trim();
  const normalizedLocation = location || 'Remote';

  return {
    title,
    company: String(job.company_name ?? 'Unknown Company').trim() || 'Unknown Company',
    location: normalizedLocation,
    remote: /remote|anywhere/i.test(normalizedLocation) ? 'Remote' : 'Unknown',
    type: String(job.job_type ?? 'Unknown').trim() || 'Unknown',
    sourceUrl,
    posted: String(job.publication_date ?? '').trim() || undefined,
    description: String(job.description ?? '').trim(),
    tags: [
      ...(Array.isArray(job.tags) ? job.tags.filter(Boolean) : []),
      ...(String(job.category ?? '').trim() ? [String(job.category).trim()] : []),
      'Remotive',
    ],
  };
}

export async function fetchAllRemotiveJobs(): Promise<ScrapedJob[]> {
  try {
    const response = await scraperFetch(REMOTIVE_API_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as RemotiveResponse;
    const normalized = (Array.isArray(payload.jobs) ? payload.jobs : [])
      .map((job) => mapRemotiveJob(job))
      .filter((job): job is NormalizedPortalJob => Boolean(job));

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('Remotive', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[RemotiveAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
