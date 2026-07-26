import type { ScrapedJob } from './ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';

const ADZUNA_API_BASE = 'https://api.adzuna.com/v1/api/jobs';
const DEFAULT_ADZUNA_COUNTRIES = ['us', 'gb', 'ca', 'au', 'de', 'fr', 'nl', 'sg', 'in', 'br'];
const DEFAULT_ADZUNA_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data analyst',
  'project manager',
  'operations manager',
  'registered nurse',
]);
const DEFAULT_ADZUNA_MAX_KEYWORDS = 120;
const DEFAULT_ADZUNA_MAX_PAGES = 12;
const DEFAULT_ADZUNA_RESULTS_PER_PAGE = 50;
const DEFAULT_ADZUNA_REQUEST_DELAY_MS = 400;
const DEFAULT_ADZUNA_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

let adzunaCooldownUntilMs = 0;

interface AdzunaPageResult {
  jobs: NormalizedPortalJob[];
  rateLimited: boolean;
}

interface AdzunaJob {
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  contract_type?: string;
  contract_time?: string;
  company?: {
    display_name?: string;
  };
  location?: {
    display_name?: string;
  };
  category?: {
    label?: string;
  };
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.round(seconds * 1000);
  }

  const retryAfterAt = Date.parse(value);
  if (Number.isFinite(retryAfterAt)) {
    return Math.max(0, retryAfterAt - Date.now());
  }

  return null;
}

function getCooldownMs(response: Response): number {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
  const envCooldownMs = Number(process.env.ADZUNA_RATE_LIMIT_COOLDOWN_MS || DEFAULT_ADZUNA_RATE_LIMIT_COOLDOWN_MS);
  const fallbackCooldownMs = Math.max(1, envCooldownMs);

  if (retryAfterMs && retryAfterMs > 0) {
    return Math.max(retryAfterMs, fallbackCooldownMs);
  }

  return fallbackCooldownMs;
}

function mapAdzunaJob(job: AdzunaJob, keyword: string, country: string): NormalizedPortalJob | null {
  const title = String(job?.title ?? '').trim();
  const sourceUrl = String(job?.redirect_url ?? '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const company = String(job?.company?.display_name ?? 'Adzuna Employer').trim() || 'Adzuna Employer';
  const location = String(job?.location?.display_name ?? 'Unknown').trim() || 'Unknown';
  const description = String(job?.description ?? '').trim();
  const remote = /remote|work from home|wfh|hybrid/i.test(`${title} ${description} ${location}`) ? 'Remote' : 'Unknown';
  const type = [String(job?.contract_time ?? '').trim(), String(job?.contract_type ?? '').trim()].filter(Boolean).join(' / ') || 'Unknown';

  return {
    title,
    company,
    location,
    remote,
    type,
    sourceUrl,
    posted: String(job?.created ?? '').trim() || undefined,
    description,
    tags: ['Adzuna', country.toUpperCase(), keyword, String(job?.category?.label ?? '').trim()].filter(Boolean),
  };
}

async function fetchAdzunaPage(
  appId: string,
  appKey: string,
  country: string,
  keyword: string,
  page: number,
  resultsPerPage: number,
): Promise<AdzunaPageResult> {
  const now = Date.now();
  if (now < adzunaCooldownUntilMs) {
    return { jobs: [], rateLimited: true };
  }

  const requestDelayMs = Math.max(0, Number(process.env.ADZUNA_REQUEST_DELAY_MS || DEFAULT_ADZUNA_REQUEST_DELAY_MS));
  if (requestDelayMs > 0) {
    await sleep(requestDelayMs);
  }

  const url = new URL(`${ADZUNA_API_BASE}/${encodeURIComponent(country)}/search/${page}`);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', String(resultsPerPage));
  url.searchParams.set('what', keyword);
  url.searchParams.set('content-type', 'application/json');

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(25_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        const cooldownMs = getCooldownMs(response);
        adzunaCooldownUntilMs = Date.now() + cooldownMs;
        console.warn(`[AdzunaAPI] Rate limited by Adzuna; pausing further requests for ${Math.round(cooldownMs / 1000)}s.`);
        return { jobs: [], rateLimited: true };
      }

      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as AdzunaResponse;
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    return {
      jobs: rows
        .map((row) => mapAdzunaJob(row, keyword, country))
        .filter((row): row is NormalizedPortalJob => Boolean(row)),
      rateLimited: false,
    };
  } catch (error) {
    console.warn(`[AdzunaAPI] Failed country=${country} keyword="${keyword}" page=${page}:`, String(error));
    return { jobs: [], rateLimited: false };
  }
}

export async function fetchAllAdzunaJobs(): Promise<ScrapedJob[]> {
  const appId = String(process.env.ADZUNA_APP_ID || '').trim();
  const appKey = String(process.env.ADZUNA_APP_KEY || '').trim();
  if (!appId || !appKey) {
    console.log('[AdzunaAPI] Skipping: set ADZUNA_APP_ID and ADZUNA_APP_KEY to enable Adzuna ingestion.');
    return [];
  }

  const countries = parseCsvEnv(process.env.ADZUNA_COUNTRIES);
  const keywords = parseCsvEnv(process.env.ADZUNA_KEYWORDS);
  const usedCountries = countries.length > 0 ? countries : DEFAULT_ADZUNA_COUNTRIES;
  const maxKeywords = Math.max(1, Number(process.env.ADZUNA_MAX_KEYWORDS || DEFAULT_ADZUNA_MAX_KEYWORDS));
  const usedKeywords = capKeywords(keywords.length > 0 ? keywords : DEFAULT_ADZUNA_KEYWORDS, maxKeywords);
  const maxPages = Math.max(1, Number(process.env.ADZUNA_MAX_PAGES || DEFAULT_ADZUNA_MAX_PAGES));
  const resultsPerPage = Math.max(10, Math.min(50, Number(process.env.ADZUNA_RESULTS_PER_PAGE || DEFAULT_ADZUNA_RESULTS_PER_PAGE)));

  const normalized: NormalizedPortalJob[] = [];
  let shouldStop = false;

  for (const country of usedCountries) {
    if (shouldStop) {
      break;
    }

    for (const keyword of usedKeywords) {
      if (shouldStop) {
        break;
      }

      for (let page = 1; page <= maxPages; page += 1) {
        const { jobs, rateLimited } = await fetchAdzunaPage(appId, appKey, country, keyword, page, resultsPerPage);
        if (rateLimited) {
          shouldStop = true;
          break;
        }

        if (jobs.length === 0) {
          break;
        }

        normalized.push(...jobs);
      }
    }
  }

  const dedup = new Map<string, NormalizedPortalJob>();
  for (const row of normalized) {
    dedup.set(row.sourceUrl, row);
  }

  return normalizeJobsWithCoordinates('Adzuna', Array.from(dedup.values()));
}
