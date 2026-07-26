import type { ScrapedJob } from './ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';

const USAJOBS_API_BASE = 'https://data.usajobs.gov/api/search';
const DEFAULT_USAJOBS_KEYWORDS = getSharedJobTitleKeywords([
  'program manager',
  'policy analyst',
  'contract specialist',
  'budget analyst',
  'public health specialist',
]);
const DEFAULT_RESULTS_PER_PAGE = 250;
const DEFAULT_MAX_PAGES = 12;
const DEFAULT_USAJOBS_MAX_KEYWORDS = 100;

interface UsaJobsItem {
  MatchedObjectDescriptor?: {
    PositionTitle?: string;
    OrganizationName?: string;
    PositionLocationDisplay?: string;
    PositionURI?: string;
    PublicationStartDate?: string;
    UserArea?: {
      Details?: {
        JobSummary?: string;
      };
    };
  };
}

interface UsaJobsResponse {
  SearchResult?: {
    SearchResultItems?: UsaJobsItem[];
  };
}

function getRequiredUsaJobsHeaders(): Record<string, string> | null {
  const apiKey = String(process.env.USAJOBS_API_KEY || '').trim();
  const email = String(process.env.USAJOBS_USER_AGENT_EMAIL || '').trim();
  if (!apiKey || !email) {
    return null;
  }

  return {
    Host: 'data.usajobs.gov',
    'User-Agent': email,
    'Authorization-Key': apiKey,
    Accept: 'application/json',
  };
}

function mapUsaJobsItem(item: UsaJobsItem, keyword: string): NormalizedPortalJob | null {
  const descriptor = item?.MatchedObjectDescriptor;
  if (!descriptor) {
    return null;
  }

  const title = String(descriptor.PositionTitle || '').trim();
  const sourceUrl = String(descriptor.PositionURI || '').trim();

  if (!title || !sourceUrl) {
    return null;
  }

  const location = String(descriptor.PositionLocationDisplay || '').trim() || 'United States';
  const description = String(descriptor.UserArea?.Details?.JobSummary || '').trim();

  return {
    title,
    company: String(descriptor.OrganizationName || 'USAJobs Employer').trim() || 'USAJobs Employer',
    location,
    remote: /remote|telework/i.test(`${title} ${description}`) ? 'Remote' : 'Unknown',
    type: 'Unknown',
    sourceUrl,
    posted: String(descriptor.PublicationStartDate || '').trim() || undefined,
    description,
    tags: ['USAJobs', 'Government', keyword],
  };
}

async function fetchUsaJobsKeywordPage(
  keyword: string,
  page: number,
  resultsPerPage: number,
  headers: Record<string, string>,
): Promise<NormalizedPortalJob[]> {
  const url = new URL(USAJOBS_API_BASE);
  url.searchParams.set('Keyword', keyword);
  url.searchParams.set('ResultsPerPage', String(resultsPerPage));
  url.searchParams.set('Page', String(page));

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(25_000),
      headers,
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as UsaJobsResponse;
    const rows = Array.isArray(payload?.SearchResult?.SearchResultItems)
      ? payload.SearchResult.SearchResultItems
      : [];

    return rows
      .map((row) => mapUsaJobsItem(row, keyword))
      .filter((row): row is NormalizedPortalJob => Boolean(row));
  } catch (error) {
    console.warn(`[USAJobsAPI] Failed keyword="${keyword}" page=${page}:`, String(error));
    return [];
  }
}

export async function fetchAllUsaJobs(): Promise<ScrapedJob[]> {
  const headers = getRequiredUsaJobsHeaders();
  if (!headers) {
    console.log('[USAJobsAPI] Skipping: set USAJOBS_API_KEY and USAJOBS_USER_AGENT_EMAIL to enable USAJobs ingestion.');
    return [];
  }

  const envKeywords = parseCsvEnv(process.env.USAJOBS_KEYWORDS);
  const maxKeywords = Math.max(1, Number(process.env.USAJOBS_MAX_KEYWORDS || DEFAULT_USAJOBS_MAX_KEYWORDS));
  const keywords = capKeywords(envKeywords.length > 0 ? envKeywords : DEFAULT_USAJOBS_KEYWORDS, maxKeywords);
  const maxPages = Math.max(1, Number(process.env.USAJOBS_MAX_PAGES || DEFAULT_MAX_PAGES));
  const resultsPerPage = Math.max(25, Math.min(500, Number(process.env.USAJOBS_RESULTS_PER_PAGE || DEFAULT_RESULTS_PER_PAGE)));

  const normalized: NormalizedPortalJob[] = [];

  for (const keyword of keywords) {
    for (let page = 1; page <= maxPages; page += 1) {
      const rows = await fetchUsaJobsKeywordPage(keyword, page, resultsPerPage, headers);
      if (rows.length === 0) {
        break;
      }
      normalized.push(...rows);
    }
  }

  const dedup = new Map<string, NormalizedPortalJob>();
  for (const row of normalized) {
    dedup.set(row.sourceUrl, row);
  }

  return normalizeJobsWithCoordinates('USAJobs', Array.from(dedup.values()));
}
