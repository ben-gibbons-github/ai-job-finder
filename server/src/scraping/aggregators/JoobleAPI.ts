import type { ScrapedJob } from '../core/ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from '../core/PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from '../core/SharedJobTitleKeywords.js';
import { capLocations, getGlobalLocationCatalog } from '../core/SharedJobLocations.js';
import { recordScraperUrlTraversal } from '../core/ScrapeDebugTelemetry.js';
import {
  isCachedHttpResponse,
  isRateLimitedScrapeError,
  scraperFetch,
  shouldSkipParsingCachedHttpPages,
} from '../core/httpCache/ScraperHttpCache.js';
import { deriveDescriptionFromContext, sanitizeJobDescription } from '../core/ScrapeDescriptionUtils.js';

const JOOBLE_API_BASE = 'https://jooble.org/api';
const DEFAULT_JOOBLE_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data analyst',
  'project manager',
  'operations manager',
  'customer service representative',
]);
const DEFAULT_JOOBLE_LOCATIONS = getGlobalLocationCatalog();
const DEFAULT_JOOBLE_MAX_PAGES = 250;
const DEFAULT_JOOBLE_MAX_KEYWORDS = 1000000;
const DEFAULT_JOOBLE_MAX_LOCATIONS = 150;
const DEFAULT_JOOBLE_MAX_DETAIL_FETCHES = 25;
const JOOBLE_DETAIL_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_JOOBLE_RATE_LIMIT_MAX_ATTEMPTS = 10;
const DEFAULT_JOOBLE_RATE_LIMIT_RETRY_DELAY_MS = 10_000;

function getJoobleRateLimitMaxAttempts(): number {
  return Math.max(1, Number(process.env.JOOBLE_RATE_LIMIT_MAX_ATTEMPTS || DEFAULT_JOOBLE_RATE_LIMIT_MAX_ATTEMPTS));
}

function getJoobleRateLimitRetryDelayMs(): number {
  return Math.max(0, Number(process.env.JOOBLE_RATE_LIMIT_RETRY_DELAY_MS ?? DEFAULT_JOOBLE_RATE_LIMIT_RETRY_DELAY_MS));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface JoobleJob {
  title?: string;
  company?: string;
  companyName?: string;
  company_name?: string;
  employer?: string;
  employerName?: string;
  employer_name?: string;
  location?: string;
  type?: string;
  link?: string;
  description?: string;
  content?: string;
  snippet?: string;
  updated?: string;
}

interface JoobleDetailFetchBudget {
  remaining: number;
}

interface JoobleResponse {
  jobs?: JoobleJob[];
}

class HttpStatusError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getJoobleDescription(job: JoobleJob): string {
  const fullDescription = sanitizeJobDescription(job.description ?? job.content);
  if (fullDescription) {
    return fullDescription;
  }

  return sanitizeJobDescription(job.snippet)
    .replace(/^(?:\s*\.{3}\s*)+/, '')
    .replace(/(?:\s*\.{3}\s*)+$/, '')
    .replace(/(?:\s*\.{3}\s*){2,}/g, ' ... ')
    .trim();
}

function extractMetaDescription(html: string): string {
  const candidates = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]*property=["']og:description["'][^>]*>/i,
  ];

  for (const pattern of candidates) {
    const value = sanitizeJobDescription(pattern.exec(html)?.[1] ?? '');
    if (value) {
      return value;
    }
  }

  return '';
}

function looksLikeCloudflareChallenge(html: string): boolean {
  return /<title>Just a moment\.\.\.<\/title>|Enable JavaScript and cookies to continue|cf_chl/i.test(html);
}

async function fetchJoobleDetailDescription(sourceUrl: string, title: string): Promise<string> {
  try {
    const response = await scraperFetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(JOOBLE_DETAIL_FETCH_TIMEOUT_MS),
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return '';
    }

    const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType && !/text\/html|application\/xhtml\+xml|application\/xml/.test(contentType)) {
      return '';
    }

    const html = await response.text();
    console.log(`[JoobleAPI] Fetched HTML content for ${sourceUrl} ${html}`);
    if (!html || looksLikeCloudflareChallenge(html)) {
      return '';
    }

    const metaDescription = extractMetaDescription(html);
    if (metaDescription.length >= 160) {
      return metaDescription;
    }

    return deriveDescriptionFromContext(html, title, 4000);
  } catch (error) {
    if (isRateLimitedScrapeError(error)) {
      return '';
    }

    console.warn(`[JoobleAPI] Detail description fetch failed for ${sourceUrl}:`, String(error));
    return '';
  }
}

function getJoobleCompany(job: JoobleJob): string {
  const candidates = [
    job?.company,
    job?.companyName,
    job?.company_name,
    job?.employer,
    job?.employerName,
    job?.employer_name,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) {
      return value;
    }
  }

  return 'Jooble Employer';
}

async function mapJoobleJob(
  job: JoobleJob,
  keyword: string,
  detailFetchBudget: JoobleDetailFetchBudget,
): Promise<NormalizedPortalJob | null> {
  const title = String(job?.title ?? '').trim();
  const sourceUrl = String(job?.link ?? '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const company = getJoobleCompany(job);
  const location = String(job?.location ?? 'Unknown').trim() || 'Unknown';
  let description = getJoobleDescription(job);

  if (!sanitizeJobDescription(job.description ?? job.content) && detailFetchBudget.remaining > 0) {
    detailFetchBudget.remaining -= 1;
    const detailedDescription = await fetchJoobleDetailDescription(sourceUrl, title);
    if (detailedDescription.length > description.length) {
      description = detailedDescription;
    }
  }

  return {
    title,
    company,
    location,
    remote: /remote|work from home|wfh|hybrid/i.test(`${title} ${description} ${location}`) ? 'Remote' : 'Unknown',
    type: String(job?.type ?? 'Unknown').trim() || 'Unknown',
    sourceUrl,
    posted: String(job?.updated ?? '').trim() || undefined,
    description,
    tags: ['Jooble', keyword],
  };
}

async function fetchJooblePage(
  apiKey: string,
  keyword: string,
  location: string,
  page: number,
  detailFetchBudget: JoobleDetailFetchBudget,
): Promise<NormalizedPortalJob[] | null> {
  const url = `${JOOBLE_API_BASE}/${encodeURIComponent(apiKey)}`;

  try {
    const response = await scraperFetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(25_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
      body: JSON.stringify({
        keywords: keyword,
        location,
        page,
      }),
    });

    if (!response.ok) {
      throw new HttpStatusError(response.status, `Fetch failed: ${response.status} ${response.statusText}`);
    }

    if (shouldSkipParsingCachedHttpPages() && response.fromCache) {
      return null;
    }

    const payload = (await response.json()) as JoobleResponse;
    const rows = Array.isArray(payload?.jobs) ? payload.jobs : [];
    const normalizedRows: NormalizedPortalJob[] = [];
    for (const row of rows) {
      const mappedRow = await mapJoobleJob(row, keyword, detailFetchBudget);
      if (mappedRow) {
        normalizedRows.push(mappedRow);
      }
    }

    return normalizedRows;
  } catch (error) {
    if (error instanceof HttpStatusError || isRateLimitedScrapeError(error)) {
      throw error;
    }

    console.warn(`[JoobleAPI] Failed keyword="${keyword}" location="${location}" page=${page}:`, String(error));
    return [];
  }
}

function isJoobleRateLimitError(error: unknown): boolean {
  return isRateLimitedScrapeError(error) || (error instanceof HttpStatusError && error.status === 403);
}

// Retries rate-limited pages with a fixed delay before giving up on the whole scrape.
async function fetchJooblePageWithRetry(
  apiKey: string,
  keyword: string,
  location: string,
  page: number,
  detailFetchBudget: JoobleDetailFetchBudget,
): Promise<{ rows: NormalizedPortalJob[] | null; gaveUp: boolean }> {
  const maxAttempts = getJoobleRateLimitMaxAttempts();
  const retryDelayMs = getJoobleRateLimitRetryDelayMs();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const rows = await fetchJooblePage(apiKey, keyword, location, page, detailFetchBudget);
      return { rows, gaveUp: false };
    } catch (error) {
      if (!isJoobleRateLimitError(error)) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        console.warn(
          `[JoobleAPI] Rate limited ${attempt} time(s) for keyword="${keyword}" location="${location}" page=${page} — giving up on the entire Jooble scrape.`,
        );
        return { rows: null, gaveUp: true };
      }

      console.warn(
        `[JoobleAPI] Rate limited (attempt ${attempt}/${maxAttempts}) for keyword="${keyword}" location="${location}" page=${page}; retrying in ${retryDelayMs / 1000}s.`,
      );
      await sleep(retryDelayMs);
    }
  }

  return { rows: null, gaveUp: true };
}

export async function fetchAllJoobleJobs(): Promise<ScrapedJob[]> {
  const apiKey = String(process.env.JOOBLE_API_KEY || '').trim();
  if (!apiKey) {
    console.log('[JoobleAPI] Skipping: set JOOBLE_API_KEY to enable Jooble ingestion.');
    return [];
  }

  const keywords = parseCsvEnv(process.env.JOOBLE_KEYWORDS);
  const locations = parseCsvEnv(process.env.JOOBLE_LOCATIONS);
  const maxKeywords = Math.max(1, Number(process.env.JOOBLE_MAX_KEYWORDS || DEFAULT_JOOBLE_MAX_KEYWORDS));
  const maxLocations = Math.max(1, Number(process.env.JOOBLE_MAX_LOCATIONS || DEFAULT_JOOBLE_MAX_LOCATIONS));
  const usedKeywords = capKeywords(keywords.length > 0 ? keywords : DEFAULT_JOOBLE_KEYWORDS, maxKeywords);
  const usedLocations = capLocations(locations.length > 0 ? locations : DEFAULT_JOOBLE_LOCATIONS, maxLocations);
  const maxPages = Math.max(1, Number(process.env.JOOBLE_MAX_PAGES || DEFAULT_JOOBLE_MAX_PAGES));
  const detailFetchBudget: JoobleDetailFetchBudget = {
    remaining: Math.max(0, Number(process.env.JOOBLE_MAX_DETAIL_FETCHES || DEFAULT_JOOBLE_MAX_DETAIL_FETCHES)),
  };

  console.log(
    `[JoobleAPI] Starting scrape with ${usedKeywords.length} keyword(s), ${usedLocations.length} location(s), up to ${maxPages} page(s) per pair.`,
  );

  const normalized: NormalizedPortalJob[] = [];
  const startedAtMs = Date.now();
  const plannedUrlCount = usedKeywords.length * usedLocations.length * maxPages;
  let fetchedPairs = 0;
  let fetchedPages = 0;
  let shouldStopScraping = false;
  let stopReason = 'completed-all-pairs';
  let sawEmptyPageStop = false;

  try {
    for (const keyword of usedKeywords) {
      if (shouldStopScraping) {
        break;
      }

      console.log(`[JoobleAPI] Keyword start: "${keyword}"`);
      for (const location of usedLocations) {
        if (shouldStopScraping) {
          break;
        }

        console.log(`[JoobleAPI]  Location start: "${location}" for keyword "${keyword}"`);
        for (let page = 1; page <= maxPages; page += 1) {
          fetchedPages += 1;
          let rows: NormalizedPortalJob[] = [];

          try {
            const { rows: fetchedRows, gaveUp } = await fetchJooblePageWithRetry(
              apiKey,
              keyword,
              location,
              page,
              detailFetchBudget,
            );
            if (gaveUp) {
              shouldStopScraping = true;
              stopReason = 'rate-limited-403';
              break;
            }
            if (fetchedRows === null) {
              continue;
            }
            rows = fetchedRows;
          } catch (error) {
            console.warn(
              `[JoobleAPI] Failed keyword="${keyword}" location="${location}" page=${page}:`,
              String(error),
            );
            rows = [];
          }

          fetchedPairs += 1;

          console.log(
            `[JoobleAPI]  Page ${page}/${maxPages} for keyword "${keyword}" location "${location}" returned ${rows.length} job(s).`,
          );

          if (rows.length === 0) {
            sawEmptyPageStop = true;
            console.log(
              `[JoobleAPI]  Stopping pagination for keyword "${keyword}" location "${location}" after empty page ${page}.`,
            );
            break;
          }

          normalized.push(...rows);
        }
      }
    }
  } finally {
    if (!shouldStopScraping) {
      stopReason = sawEmptyPageStop
        ? 'completed-all-pairs-after-empty-pages'
        : 'completed-all-pairs-reached-max-pages';
    }

    recordScraperUrlTraversal({
      sourceName: 'Jooble',
      plannedUrlCount,
      actualUrlCount: fetchedPages,
      stopReason,
    });
  }

  const dedup = new Map<string, NormalizedPortalJob>();
  for (const row of normalized) {
    dedup.set(row.sourceUrl, row);
  }

  const durationMs = Date.now() - startedAtMs;
  console.log(
    `[JoobleAPI] Completed scrape: ${normalized.length} raw job(s), ${dedup.size} unique job(s), ${fetchedPairs} keyword/location pair(s), ${fetchedPages} page request(s), took ${durationMs}ms.`,
  );

  return normalizeJobsWithCoordinates('Jooble', Array.from(dedup.values()));
}
