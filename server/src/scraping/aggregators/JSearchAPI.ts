import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from '../core/SharedJobTitleKeywords.js';
import { isRateLimitedScrapeError, scraperFetch } from '../core/httpCache/ScraperHttpCache.js';

// JSearch aggregates Indeed, LinkedIn, ZipRecruiter, Glassdoor, and more.
// Requires a RapidAPI key: set RAPIDAPI_KEY env var.
// Free tier: ~200 req/month. Paid tiers available for heavier use.

const JSEARCH_API_BASE = 'https://jsearch.p.rapidapi.com/search-v2';
const JSEARCH_HOST = 'jsearch.p.rapidapi.com';

const DEFAULT_JSEARCH_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data scientist',
  'product manager',
  'environmental engineer',
  'public health',
]);
const DEFAULT_JSEARCH_MAX_KEYWORDS = 1200;
const DEFAULT_JSEARCH_MAX_PAGES = 60; // 10 results/page by default
const DEFAULT_JSEARCH_NUM_PAGES = 100; // results per page (max 10)
const DEFAULT_JSEARCH_COUNTRY = 'us';
const DEFAULT_JSEARCH_DATE_POSTED = 'all';
const DEFAULT_JSEARCH_LOCATIONS = [''];
const DEFAULT_JSEARCH_MAX_LOCATIONS = 50;
const DEFAULT_JSEARCH_MAX_DETAILS = 25;
const DEFAULT_JSEARCH_MAX_SALARY_LOOKUPS = 10;

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
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
  job_salary_period?: string;
}

interface JSearchResponse {
  data?: JSearchJob[];
  status?: string;
}

interface JSearchDetailsResponse {
  data?: JSearchJob | JSearchJob[];
}

function isEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

async function fetchJSearchJson<T>(url: URL, apiKey: string): Promise<T> {
  const response = await scraperFetch(url.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': JSEARCH_HOST,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function enrichWithJobDetails(job: JSearchJob, country: string, apiKey: string): Promise<JSearchJob> {
  if (!job.job_id) return job;

  const url = new URL('https://jsearch.p.rapidapi.com/job-details');
  url.searchParams.set('job_id', job.job_id);
  url.searchParams.set('country', country);
  const payload = await fetchJSearchJson<JSearchDetailsResponse>(url, apiKey);
  const details = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  return details ? { ...job, ...details } : job;
}

interface JSearchSalaryEstimate {
  minSalary?: number;
  maxSalary?: number;
  currency?: string;
  period?: string;
}

function asFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchSalaryEstimate(job: JSearchJob, apiKey: string): Promise<JSearchSalaryEstimate | null> {
  const title = String(job.job_title ?? '').trim();
  const location = [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ');
  if (!title) return null;

  const url = new URL('https://jsearch.p.rapidapi.com/estimated-salary');
  url.searchParams.set('job_title', title);
  url.searchParams.set('location', location || 'United States');
  url.searchParams.set('location_type', 'ANY');
  url.searchParams.set('years_of_experience', 'ALL');
  const payload = await fetchJSearchJson<{ data?: Record<string, unknown> | Array<Record<string, unknown>> }>(url, apiKey);
  const salary = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!salary) return null;

  const minSalary = asFiniteNumber(salary.min_salary ?? salary.salary_min);
  const maxSalary = asFiniteNumber(salary.max_salary ?? salary.salary_max);
  if (minSalary === undefined && maxSalary === undefined) return null;

  return {
    minSalary,
    maxSalary,
    currency: String(salary.currency ?? salary.salary_currency ?? 'USD').trim() || 'USD',
    period: String(salary.salary_period ?? salary.period ?? 'YEAR').trim() || 'YEAR',
  };
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
    salaryMin: asFiniteNumber(job.job_min_salary),
    salaryMax: asFiniteNumber(job.job_max_salary),
    salaryCurrency: String(job.job_salary_currency ?? '').trim() || undefined,
    salaryPeriod: String(job.job_salary_period ?? '').trim() || undefined,
    salaryIsEstimated: false,
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
  const country = String(process.env.JSEARCH_COUNTRY || DEFAULT_JSEARCH_COUNTRY).trim().toLowerCase();
  const datePosted = String(process.env.JSEARCH_DATE_POSTED || DEFAULT_JSEARCH_DATE_POSTED).trim();
  const configuredLocations = parseCsvEnv(process.env.JSEARCH_LOCATIONS);
  const locations = (configuredLocations.length > 0 ? configuredLocations : DEFAULT_JSEARCH_LOCATIONS)
    .slice(0, Math.max(1, Number(process.env.JSEARCH_MAX_LOCATIONS || DEFAULT_JSEARCH_MAX_LOCATIONS)));
  const includeDetails = isEnabled(process.env.JSEARCH_INCLUDE_DETAILS);
  const includeSalary = isEnabled(process.env.JSEARCH_INCLUDE_SALARY);
  const maxDetails = Math.max(0, Number(process.env.JSEARCH_MAX_DETAILS || DEFAULT_JSEARCH_MAX_DETAILS));
  const maxSalaryLookups = Math.max(0, Number(process.env.JSEARCH_MAX_SALARY_LOOKUPS || DEFAULT_JSEARCH_MAX_SALARY_LOOKUPS));

  const normalized: NormalizedPortalJob[] = [];
  const seen = new Set<string>();
  let rateLimited = false;

  for (const keyword of keywords) {
    if (rateLimited) break;
    for (const location of locations) {
      if (rateLimited) break;
      for (let page = 1; page <= maxPages; page++) {
      if (rateLimited) break;
      try {
        const url = new URL(JSEARCH_API_BASE);
        url.searchParams.set('query', `${keyword} jobs${location ? ` in ${location}` : ''}`);
        url.searchParams.set('page', String(page));
        url.searchParams.set('num_pages', String(numPages));
        url.searchParams.set('country', country);
        url.searchParams.set('date_posted', datePosted);
        const data = await fetchJSearchJson<JSearchResponse>(url, apiKey);

        const jobs = Array.isArray(data?.data) ? data.data : [];
        if (jobs.length === 0) break;

        for (const originalJob of jobs) {
          let job = originalJob;
          if (includeDetails && normalized.length < maxDetails) {
            try {
              job = await enrichWithJobDetails(job, country, apiKey);
            } catch (error) {
              if (isRateLimitedScrapeError(error)) throw error;
              console.warn(`[JSearchAPI] Details unavailable for ${job.job_id}:`, String(error));
            }
          }

          let salaryEstimate: JSearchSalaryEstimate | null = null;
          if (includeSalary && normalized.length < maxSalaryLookups) {
            try {
              salaryEstimate = await fetchSalaryEstimate(job, apiKey);
            } catch (error) {
              if (isRateLimitedScrapeError(error)) throw error;
              console.warn(`[JSearchAPI] Salary unavailable for ${job.job_title}:`, String(error));
            }
          }

          const mapped = mapJSearchJob(job);
          if (!mapped) continue;
          const key = `${mapped.sourceUrl}`;
          if (seen.has(key)) continue;
          seen.add(key);
          normalized.push({
            ...mapped,
            salaryMin: salaryEstimate?.minSalary ?? mapped.salaryMin,
            salaryMax: salaryEstimate?.maxSalary ?? mapped.salaryMax,
            salaryCurrency: salaryEstimate?.currency ?? mapped.salaryCurrency,
            salaryPeriod: salaryEstimate?.period ?? mapped.salaryPeriod,
            salaryIsEstimated: Boolean(salaryEstimate),
          });
        }

        if (jobs.length < numPages) break;
      } catch (error) {
        if (isRateLimitedScrapeError(error)) {
          rateLimited = true;
          console.warn('[JSearchAPI] Rate limited by RapidAPI; stopping the entire JSearch scrape.');
          break;
        }
        console.warn(`[JSearchAPI] Failed keyword "${keyword}" location "${location}" page ${page}:`, String(error));
        break;
      }
      }
    }
  }

  console.log(`[JSearchAPI] Fetched ${normalized.length} jobs across ${keywords.length} keywords and ${locations.length} locations.`);
  return normalizeJobsWithCoordinates('JSearch', normalized);
}
