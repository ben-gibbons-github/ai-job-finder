import type { ScrapedJob } from './ScrapedJob.js';
import { sanitizeJobDescription } from './ScrapeDescriptionUtils.js';
import { scraperFetch } from './httpCache/ScraperHttpCache.js';

const FETCH_TIMEOUT_MS = 30_000;

export interface NormalizedPortalJob {
  title: string;
  company: string;
  location?: string;
  remote?: string;
  type?: string;
  sourceUrl: string;
  posted?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  salaryIsEstimated?: boolean;
  description?: string;
  tags?: string[];
}

function toScrapedJob(source: string, job: NormalizedPortalJob, lat: number, lon: number): ScrapedJob {
  return {
    name: job.title || 'Unknown Role',
    company_name: job.company || 'Unknown Company',
    location: job.location || 'Remote',
    remote: job.remote || 'Unknown',
    location_lat: lat,
    location_lon: lon,
    description: sanitizeJobDescription(job.description),
    type: job.type || 'Full-time',
    source,
    source_url: job.sourceUrl,
    posted: job.posted || new Date().toISOString(),
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    salary_period: job.salaryPeriod,
    salary_is_estimated: job.salaryIsEstimated,
    impact_number: 0,
    audit_number: 0,
    audit_text: '',
    tags: Array.isArray(job.tags) ? job.tags.filter(Boolean) : []
  };
}

export function parseCsvEnv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export async function normalizeJobsWithCoordinates(
  source: string,
  jobs: NormalizedPortalJob[],
): Promise<ScrapedJob[]> {
  // Keep ingestion non-blocking: do not wait on network geocoding during scraping.
  // Missing coordinates are backfilled later by background geocoding.
  return jobs.map((job) => toScrapedJob(source, job, 0, 0));
}

export async function fetchJson(url: string): Promise<unknown> {
  const res = await scraperFetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'job-finder-super-scraper/1.0',
    },
  });

  if (!res.ok) {
    console.warn(`[PortalIngestionUtils] fetchJson failed status=${res.status} url=${url}`);
    throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
  }

  console.log(`[PortalIngestionUtils] fetchJson ok status=${res.status} fromCache=${Boolean(res.fromCache)} url=${url}`);
  return res.json();
}
