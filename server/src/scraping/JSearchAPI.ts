import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';

// JSearch aggregates Indeed, LinkedIn, ZipRecruiter, Glassdoor, and more.
// Requires a RapidAPI key: set RAPIDAPI_KEY env var.
// Free tier: ~200 req/month. Paid tiers available for heavier use.

const JSEARCH_API_BASE = 'https://jsearch.p.rapidapi.com/search';
const JSEARCH_HOST = 'jsearch.p.rapidapi.com';

const DEFAULT_JSEARCH_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data scientist',
  'product manager',
  'environmental engineer',
  'public health',
]);
const DEFAULT_JSEARCH_MAX_KEYWORDS = 80;
const DEFAULT_JSEARCH_MAX_PAGES = 3; // 10 results/page by default
const DEFAULT_JSEARCH_NUM_PAGES = 10; // results per page (max 10)

interface JSearchJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_is_remote?: boolean;
  job_employment_type?: string;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string;
  job_description?: string;
  job_required_skills?: string[];
}

interface JSearchResponse {
  data?: JSearchJob[];
  status?: string;
}

function mapJSearchJob(job: JSearchJob): NormalizedPortalJob | null {
  const title = String(job.job_title ?? '').trim();
  const sourceUrl = String(job.job_apply_link ?? '').trim();
  if (!title || !sourceUrl) return null;

  const locationParts = [job.job_city, job.job_state, job.job_country].filter(Boolean);
  const location = job.job_is_remote ? 'Remote' : locationParts.join(', ') || 'Unknown';

  return {
    title,
    company: String(job.employer_name ?? '').trim() || 'Unknown',
    location,
    remote: job.job_is_remote ? 'Remote' : 'Unknown',
    type: String(job.job_employment_type ?? 'Full-time').replace(/_/g, '-'),
    sourceUrl,
    posted: job.job_posted_at_datetime_utc,
    description: String(job.job_description ?? '').slice(0, 4000),
    tags: ['JSearch', ...(job.job_required_skills ?? []).slice(0, 5)],
  };
}

export async function fetchAllJSearchJobs(): Promise<ScrapedJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    console.log('[JSearchAPI] Skipping — RAPIDAPI_KEY env var not set.');
    return [];
  }

  const envKeywords = parseCsvEnv(process.env.JSEARCH_KEYWORDS);
  const keywords = capKeywords(
    envKeywords.length > 0 ? envKeywords : DEFAULT_JSEARCH_KEYWORDS,
    Math.max(1, Number(process.env.JSEARCH_MAX_KEYWORDS || DEFAULT_JSEARCH_MAX_KEYWORDS)),
  );
  const maxPages = Math.max(1, Number(process.env.JSEARCH_MAX_PAGES || DEFAULT_JSEARCH_MAX_PAGES));
  const numPages = Math.max(1, Math.min(10, Number(process.env.JSEARCH_NUM_PAGES || DEFAULT_JSEARCH_NUM_PAGES)));

  const normalized: NormalizedPortalJob[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const url = new URL(JSEARCH_API_BASE);
        url.searchParams.set('query', keyword);
        url.searchParams.set('page', String(page));
        url.searchParams.set('num_pages', String(numPages));
        url.searchParams.set('date_posted', 'month');

        const response = await fetch(url.toString(), {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': JSEARCH_HOST,
          },
        });

        if (!response.ok) {
          console.warn(`[JSearchAPI] HTTP ${response.status} for keyword "${keyword}" page ${page}`);
          break;
        }

        const data = await response.json() as JSearchResponse;

        const jobs = Array.isArray(data?.data) ? data.data : [];
        if (jobs.length === 0) break;

        for (const job of jobs) {
          const mapped = mapJSearchJob(job);
          if (!mapped) continue;
          const key = `${mapped.sourceUrl}`;
          if (seen.has(key)) continue;
          seen.add(key);
          normalized.push(mapped);
        }

        if (jobs.length < numPages) break;
      } catch (error) {
        console.warn(`[JSearchAPI] Failed keyword "${keyword}" page ${page}:`, String(error));
        break;
      }
    }
  }

  console.log(`[JSearchAPI] Fetched ${normalized.length} jobs across ${keywords.length} keywords.`);
  return normalizeJobsWithCoordinates('JSearch', normalized);
}
