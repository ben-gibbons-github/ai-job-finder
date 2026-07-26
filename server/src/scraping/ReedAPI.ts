import type { ScrapedJob } from './ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';

const REED_API_URL = 'https://www.reed.co.uk/api/1.0/search';
const DEFAULT_REED_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data analyst',
  'project manager',
  'operations manager',
  'business analyst',
]);
const DEFAULT_REED_LOCATIONS = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol', 'Glasgow', 'Edinburgh', 'Liverpool', 'Nottingham', 'Leicester'];
const DEFAULT_REED_MAX_PAGES = 12;
const DEFAULT_REED_RESULTS_PER_PAGE = 100;
const DEFAULT_REED_MAX_KEYWORDS = 120;

interface ReedJob {
  jobTitle?: string;
  employerName?: string;
  locationName?: string;
  jobUrl?: string;
  jobDescription?: string;
  date?: string;
  fullTime?: boolean;
  partTime?: boolean;
  minimumSalary?: number;
  maximumSalary?: number;
}

interface ReedResponse {
  results?: ReedJob[];
}

function getReedAuthHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${token}`;
}

function mapReedJob(job: ReedJob, keyword: string): NormalizedPortalJob | null {
  const title = String(job?.jobTitle ?? '').trim();
  const sourceUrl = String(job?.jobUrl ?? '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const description = String(job?.jobDescription ?? '').trim();
  const location = String(job?.locationName ?? 'United Kingdom').trim() || 'United Kingdom';
  const remote = /remote|work from home|wfh|hybrid/i.test(`${title} ${description} ${location}`) ? 'Remote' : 'Unknown';

  let type = 'Unknown';
  if (job?.fullTime) {
    type = 'Full-time';
  } else if (job?.partTime) {
    type = 'Part-time';
  }

  const salaryTag =
    Number.isFinite(job?.minimumSalary) || Number.isFinite(job?.maximumSalary)
      ? `Salary ${Number(job?.minimumSalary || 0)}-${Number(job?.maximumSalary || 0)}`
      : '';

  return {
    title,
    company: String(job?.employerName ?? 'Reed Employer').trim() || 'Reed Employer',
    location,
    remote,
    type,
    sourceUrl,
    posted: String(job?.date ?? '').trim() || undefined,
    description,
    tags: ['Reed', keyword, salaryTag].filter(Boolean),
  };
}

async function fetchReedPage(
  apiKey: string,
  keyword: string,
  location: string,
  page: number,
  resultsPerPage: number,
): Promise<NormalizedPortalJob[]> {
  const url = new URL(REED_API_URL);
  url.searchParams.set('keywords', keyword);
  url.searchParams.set('locationName', location);
  url.searchParams.set('resultsToTake', String(resultsPerPage));
  url.searchParams.set('page', String(page));

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(25_000),
      headers: {
        Accept: 'application/json',
        Authorization: getReedAuthHeader(apiKey),
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as ReedResponse;
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    return rows
      .map((row) => mapReedJob(row, keyword))
      .filter((row): row is NormalizedPortalJob => Boolean(row));
  } catch (error) {
    console.warn(`[ReedAPI] Failed keyword="${keyword}" location="${location}" page=${page}:`, String(error));
    return [];
  }
}

export async function fetchAllReedJobs(): Promise<ScrapedJob[]> {
  const apiKey = String(process.env.REED_API_KEY || '').trim();
  if (!apiKey) {
    console.log('[ReedAPI] Skipping: set REED_API_KEY to enable Reed ingestion.');
    return [];
  }

  const keywords = parseCsvEnv(process.env.REED_KEYWORDS);
  const locations = parseCsvEnv(process.env.REED_LOCATIONS);
  const maxKeywords = Math.max(1, Number(process.env.REED_MAX_KEYWORDS || DEFAULT_REED_MAX_KEYWORDS));
  const usedKeywords = capKeywords(keywords.length > 0 ? keywords : DEFAULT_REED_KEYWORDS, maxKeywords);
  const usedLocations = locations.length > 0 ? locations : DEFAULT_REED_LOCATIONS;
  const maxPages = Math.max(1, Number(process.env.REED_MAX_PAGES || DEFAULT_REED_MAX_PAGES));
  const resultsPerPage = Math.max(10, Math.min(100, Number(process.env.REED_RESULTS_PER_PAGE || DEFAULT_REED_RESULTS_PER_PAGE)));

  const normalized: NormalizedPortalJob[] = [];

  for (const keyword of usedKeywords) {
    for (const location of usedLocations) {
      for (let page = 1; page <= maxPages; page += 1) {
        const rows = await fetchReedPage(apiKey, keyword, location, page, resultsPerPage);
        if (rows.length === 0) {
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

  return normalizeJobsWithCoordinates('Reed', Array.from(dedup.values()));
}
