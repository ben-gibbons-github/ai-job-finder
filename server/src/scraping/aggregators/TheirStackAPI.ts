import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from '../core/SharedJobTitleKeywords.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const THEIRSTACK_SEARCH_URL = 'https://api.theirstack.com/v1/jobs/search';
const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_KEYWORDS = 20;

interface TheirStackJob {
  id?: number;
  job_title?: string;
  company?: string;
  location?: string;
  long_location?: string;
  remote?: boolean;
  hybrid?: boolean;
  employment_statuses?: string[];
  final_url?: string;
  source_url?: string;
  url?: string;
  date_posted?: string;
  description?: string;
  keyword_slugs?: string[];
  technology_slugs?: string[];
  min_annual_salary?: number;
  max_annual_salary?: number;
  min_annual_salary_usd?: number;
  max_annual_salary_usd?: number;
  salary_currency?: string;
}

interface TheirStackResponse {
  data?: TheirStackJob[];
  next_cursor?: string | null;
  metadata?: { next_cursor?: string | null };
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapTheirStackJob(job: TheirStackJob): NormalizedPortalJob | null {
  const title = String(job.job_title ?? '').trim();
  const sourceUrl = String(job.final_url ?? job.source_url ?? job.url ?? '').trim();
  if (!title || !sourceUrl) return null;

  const location = String(job.long_location ?? job.location ?? 'Unknown').trim() || 'Unknown';
  const remote = job.remote ? 'Remote' : job.hybrid ? 'Hybrid' : 'On-site';
  const minSalary = toFiniteNumber(job.min_annual_salary_usd ?? job.min_annual_salary);
  const maxSalary = toFiniteNumber(job.max_annual_salary_usd ?? job.max_annual_salary);

  return {
    title,
    company: String(job.company ?? 'Unknown Company').trim() || 'Unknown Company',
    location,
    remote,
    type: (job.employment_statuses ?? []).map((value) => value.replace(/_/g, '-')).join(' / ') || 'Unknown',
    sourceUrl,
    posted: String(job.date_posted ?? '').trim() || undefined,
    salaryMin: minSalary,
    salaryMax: maxSalary,
    salaryCurrency: String(job.salary_currency ?? (minSalary !== undefined || maxSalary !== undefined ? 'USD' : '')).trim() || undefined,
    salaryPeriod: minSalary !== undefined || maxSalary !== undefined ? 'YEAR' : undefined,
    salaryIsEstimated: false,
    description: String(job.description ?? ''),
    tags: ['TheirStack', ...(job.keyword_slugs ?? []), ...(job.technology_slugs ?? [])].slice(0, 12),
  };
}

export async function fetchAllTheirStackJobs(): Promise<ScrapedJob[]> {
  const apiKey = String(process.env.THEIRSTACK_API_KEY ?? '').trim();
  if (!apiKey) {
    console.log('[TheirStackAPI] Skipping: set THEIRSTACK_API_KEY to enable TheirStack ingestion.');
    return [];
  }

  const configuredKeywords = parseCsvEnv(process.env.THEIRSTACK_JOB_TITLES);
  const keywords = capKeywords(
    configuredKeywords.length > 0 ? configuredKeywords : getSharedJobTitleKeywords(['software engineer', 'data analyst']),
    Math.max(1, Number(process.env.THEIRSTACK_MAX_KEYWORDS || DEFAULT_MAX_KEYWORDS)),
  );
  const limit = Math.max(1, Math.min(25, Number(process.env.THEIRSTACK_LIMIT || DEFAULT_LIMIT)));
  const maxPages = Math.max(1, Number(process.env.THEIRSTACK_MAX_PAGES || DEFAULT_MAX_PAGES));
  const maxAgeDays = Math.max(0, Number(process.env.THEIRSTACK_POSTED_MAX_AGE_DAYS || DEFAULT_MAX_AGE_DAYS));
  const normalized: NormalizedPortalJob[] = [];
  const seenUrls = new Set<string>();
  let creditsExhausted = false;

  for (const keyword of keywords) {
    if (creditsExhausted) break;
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      if (creditsExhausted) break;
      const body: Record<string, unknown> = {
        job_title_or: [keyword],
        posted_at_max_age_days: maxAgeDays,
        is_closed: false,
        limit,
      };
      if (cursor) body.cursor = cursor;

      try {
        const response = await scraperFetch(THEIRSTACK_SEARCH_URL, {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          if (response.status === 402) {
            creditsExhausted = true;
            console.warn('[TheirStackAPI] Credits exhausted; stopping the entire TheirStack scrape.');
            break;
          }
          console.warn(`[TheirStackAPI] HTTP ${response.status} for title "${keyword}" page ${page + 1}.`);
          break;
        }

        const payload = await response.json() as TheirStackResponse;
        const jobs = Array.isArray(payload.data) ? payload.data : [];
        for (const job of jobs) {
          const mapped = mapTheirStackJob(job);
          if (mapped && !seenUrls.has(mapped.sourceUrl)) {
            seenUrls.add(mapped.sourceUrl);
            normalized.push(mapped);
          }
        }

        cursor = payload.next_cursor ?? payload.metadata?.next_cursor ?? null;
        if (!cursor || jobs.length === 0) break;
      } catch (error) {
        console.warn(`[TheirStackAPI] Failed title "${keyword}" page ${page + 1}:`, String(error));
        break;
      }
    }
  }

  console.log(`[TheirStackAPI] Fetched ${normalized.length} jobs across ${keywords.length} job-title queries.`);
  return normalizeJobsWithCoordinates('TheirStack', normalized);
}