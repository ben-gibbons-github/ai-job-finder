import type { ScrapedJob } from './ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';

const JOOBLE_API_BASE = 'https://jooble.org/api';
const DEFAULT_JOOBLE_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data analyst',
  'project manager',
  'operations manager',
  'customer service representative',
]);
const DEFAULT_JOOBLE_LOCATIONS = ['United States', 'Remote', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Netherlands'];
const DEFAULT_JOOBLE_MAX_PAGES = 10;
const DEFAULT_JOOBLE_MAX_KEYWORDS = 120;

interface JoobleJob {
  title?: string;
  company?: string;
  location?: string;
  type?: string;
  link?: string;
  snippet?: string;
  updated?: string;
}

interface JoobleResponse {
  jobs?: JoobleJob[];
}

function mapJoobleJob(job: JoobleJob, keyword: string): NormalizedPortalJob | null {
  const title = String(job?.title ?? '').trim();
  const sourceUrl = String(job?.link ?? '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const company = String(job?.company ?? 'Jooble Employer').trim() || 'Jooble Employer';
  const location = String(job?.location ?? 'Unknown').trim() || 'Unknown';
  const description = String(job?.snippet ?? '').trim();

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
    const response = await fetch(url, {
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
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as JoobleResponse;
    const rows = Array.isArray(payload?.jobs) ? payload.jobs : [];
    return rows
      .map((row) => mapJoobleJob(row, keyword))
      .filter((row): row is NormalizedPortalJob => Boolean(row));
  } catch (error) {
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
  const usedKeywords = capKeywords(keywords.length > 0 ? keywords : DEFAULT_JOOBLE_KEYWORDS, maxKeywords);
  const usedLocations = locations.length > 0 ? locations : DEFAULT_JOOBLE_LOCATIONS;
  const maxPages = Math.max(1, Number(process.env.JOOBLE_MAX_PAGES || DEFAULT_JOOBLE_MAX_PAGES));

  console.log(
    `[JoobleAPI] Starting scrape with ${usedKeywords.length} keyword(s), ${usedLocations.length} location(s), up to ${maxPages} page(s) per pair.`,
  );

  const normalized: NormalizedPortalJob[] = [];
  const startedAtMs = Date.now();
  let fetchedPairs = 0;
  let fetchedPages = 0;

  for (const keyword of usedKeywords) {
    console.log(`[JoobleAPI] Keyword start: "${keyword}"`);
    for (const location of usedLocations) {
      console.log(`[JoobleAPI]  Location start: "${location}" for keyword "${keyword}"`);
      for (let page = 1; page <= maxPages; page += 1) {
        fetchedPages += 1;
        const rows = await fetchJooblePage(apiKey, keyword, location, page);
        fetchedPairs += 1;

        console.log(
          `[JoobleAPI]  Page ${page}/${maxPages} for keyword "${keyword}" location "${location}" returned ${rows.length} job(s).`,
        );

        if (rows.length === 0) {
          console.log(
            `[JoobleAPI]  Stopping pagination for keyword "${keyword}" location "${location}" after empty page ${page}.`,
          );
          break;
        }

        normalized.push(...rows);
      }
    }
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
