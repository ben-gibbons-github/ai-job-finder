import type { ScrapedJob } from './ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';
import { capLocations, getGlobalLocationCatalog } from './SharedJobLocations.js';
import { recordScraperUrlTraversal } from './ScrapeDebugTelemetry.js';
import { isRateLimitedScrapeError, scraperFetch } from './ScraperHttpCache.js';
import { sanitizeJobDescription } from './ScrapeDescriptionUtils.js';

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
const DEFAULT_JOOBLE_MAX_KEYWORDS = 3000;
const DEFAULT_JOOBLE_MAX_LOCATIONS = 120;

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

function mapJoobleJob(job: JoobleJob, keyword: string): NormalizedPortalJob | null {
  const title = String(job?.title ?? '').trim();
  const sourceUrl = String(job?.link ?? '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const company = getJoobleCompany(job);
  const location = String(job?.location ?? 'Unknown').trim() || 'Unknown';
  const description = getJoobleDescription(job);

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

async function fetchJooblePage(apiKey: string, keyword: string, location: string, page: number): Promise<NormalizedPortalJob[]> {
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

    const payload = (await response.json()) as JoobleResponse;
    const rows = Array.isArray(payload?.jobs) ? payload.jobs : [];
    return rows
      .map((row) => mapJoobleJob(row, keyword))
      .filter((row): row is NormalizedPortalJob => Boolean(row));
  } catch (error) {
    if (error instanceof HttpStatusError || isRateLimitedScrapeError(error)) {
      throw error;
    }

    console.warn(`[JoobleAPI] Failed keyword="${keyword}" location="${location}" page=${page}:`, String(error));
    return [];
  }
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
            rows = await fetchJooblePage(apiKey, keyword, location, page);
          } catch (error) {
            if (isRateLimitedScrapeError(error)) {
              console.warn('[JoobleAPI] Received 403 Forbidden — stopping the entire Jooble scrape.');
              shouldStopScraping = true;
              stopReason = 'rate-limited-403';
              break;
            }

            if (error instanceof HttpStatusError && error.status === 403) {
              console.warn('[JoobleAPI] Received 403 Forbidden — stopping the entire Jooble scrape.');
              shouldStopScraping = true;
              stopReason = 'rate-limited-403';
              break;
            }

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
