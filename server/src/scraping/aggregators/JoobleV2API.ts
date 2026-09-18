import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from '../core/SharedJobTitleKeywords.js';
import { recordPageJobCount } from '../core/ScrapeDebugTelemetry.js';
import { isRateLimitedScrapeError, scraperFetch } from '../core/httpCache/ScraperHttpCache.js';

const JOOBLE_PUBLISHER_API_BASE = 'https://jooble.org/api';
const DEFAULT_MAX_KEYWORDS = 5_000;
const DEFAULT_MAX_PAGES = 5;

interface JoobleV2Job {
  title?: string;
  company?: string;
  location?: string;
  type?: string;
  link?: string;
  description?: string;
  snippet?: string;
  updated?: string;
}

interface JoobleV2Response {
  jobs?: JoobleV2Job[];
}

function mapJoobleV2Job(job: JoobleV2Job, keyword: string): NormalizedPortalJob | null {
  const title = String(job.title ?? '').trim();
  const sourceUrl = String(job.link ?? '').trim();
  if (!title || !sourceUrl) return null;

  const location = String(job.location ?? 'Unknown').trim() || 'Unknown';
  const description = String(job.description ?? job.snippet ?? '').trim();
  return {
    title,
    company: String(job.company ?? 'Jooble Employer').trim() || 'Jooble Employer',
    location,
    remote: /remote|work from home|wfh|hybrid/i.test(`${title} ${description} ${location}`) ? 'Remote' : 'Unknown',
    type: String(job.type ?? 'Unknown').trim() || 'Unknown',
    sourceUrl,
    posted: String(job.updated ?? '').trim() || undefined,
    description,
    tags: ['JoobleV2', keyword],
  };
}

export async function fetchAllJoobleV2Jobs(): Promise<ScrapedJob[]> {
  const apiKey = String(process.env.JOOBLE_V2_API_KEY ?? '').trim();
  if (!apiKey) {
    console.log('[JoobleV2] Skipping: set JOOBLE_V2_API_KEY to enable publisher API ingestion.');
    return [];
  }

  const configuredKeywords = parseCsvEnv(process.env.JOOBLE_V2_KEYWORDS);
  const keywords = capKeywords(
    configuredKeywords.length > 0
      ? configuredKeywords
      : getSharedJobTitleKeywords(['software engineer', 'data analyst']),
    Math.max(1, Number(process.env.JOOBLE_V2_MAX_KEYWORDS || DEFAULT_MAX_KEYWORDS)),
  );
  const maxPages = Math.max(1, Number(process.env.JOOBLE_V2_MAX_PAGES || DEFAULT_MAX_PAGES));
  const normalized = new Map<string, NormalizedPortalJob>();
  let rateLimited = false;

  for (const keyword of keywords) {
    if (rateLimited) break;
    for (let page = 1; page <= maxPages; page += 1) {
      try {
        const response = await scraperFetch(`${JOOBLE_PUBLISHER_API_BASE}/${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          signal: AbortSignal.timeout(25_000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'job-finder-super-scraper/1.0' },
          body: JSON.stringify({ keywords: keyword, page: String(page) }),
        });
        if (!response.ok) {
          if (response.status === 403 || response.status === 429) {
            rateLimited = true;
            console.warn('[JoobleV2] Publisher API rate limited; stopping the entire scrape.');
          } else {
            console.warn(`[JoobleV2] HTTP ${response.status} for keyword "${keyword}" page ${page}.`);
          }
          break;
        }

        const payload = await response.json() as JoobleV2Response;
        const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        const pageJobs: NormalizedPortalJob[] = [];
        for (const job of jobs) {
          const mapped = mapJoobleV2Job(job, keyword);
          if (mapped) {
            pageJobs.push(mapped);
            normalized.set(mapped.sourceUrl, mapped);
          }
        }
        recordPageJobCount({
          sourceName: 'JoobleV2',
          query: `keyword=${keyword}`,
          page,
          jobsFound: pageJobs.length,
          sourceUrls: pageJobs.map((job) => job.sourceUrl),
        });
        if (jobs.length === 0) break;
      } catch (error) {
        if (isRateLimitedScrapeError(error)) {
          rateLimited = true;
          console.warn('[JoobleV2] Publisher API rate limited; stopping the entire scrape.');
        } else {
          console.warn(`[JoobleV2] Failed keyword "${keyword}" page ${page}:`, String(error));
        }
        break;
      }
    }
  }

  console.log(`[JoobleV2] Fetched ${normalized.size} unique jobs across ${keywords.length} keyword queries.`);
  return normalizeJobsWithCoordinates('JoobleV2', Array.from(normalized.values()));
}