import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const THE_MUSE_API_BASE_URL = 'https://www.themuse.com/api/public/jobs';
const MAX_THE_MUSE_PAGES = 50;

interface TheMuseCompany {
  name?: string;
}

interface TheMuseLocation {
  name?: string;
}

interface TheMuseRef {
  landing_page?: string;
}

interface TheMuseJob {
  name?: string;
  company?: TheMuseCompany;
  locations?: TheMuseLocation[];
  publication_date?: string;
  contents?: string;
  refs?: TheMuseRef;
  categories?: Array<{ name?: string }>;
  levels?: Array<{ name?: string }>;
}

interface TheMuseResponse {
  page?: number;
  page_count?: number;
  results?: TheMuseJob[];
}

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapTheMuseJob(job: TheMuseJob): NormalizedPortalJob | null {
  const title = String(job.name ?? '').trim();
  const sourceUrl = String(job.refs?.landing_page ?? '').trim();

  if (!title || !sourceUrl) {
    return null;
  }

  const primaryLocation = Array.isArray(job.locations)
    ? String(job.locations.find((loc) => String(loc?.name ?? '').trim().length > 0)?.name ?? '').trim()
    : '';

  const categories = Array.isArray(job.categories)
    ? job.categories
        .map((cat) => String(cat?.name ?? '').trim())
        .filter(Boolean)
    : [];

  const levels = Array.isArray(job.levels)
    ? job.levels
        .map((lvl) => String(lvl?.name ?? '').trim())
        .filter(Boolean)
    : [];

  const location = primaryLocation || 'Unknown';

  return {
    title,
    company: String(job.company?.name ?? 'Unknown Company').trim() || 'Unknown Company',
    location,
    remote: /remote|anywhere/i.test(location) ? 'Remote' : 'Unknown',
    type: levels[0] || 'Unknown',
    sourceUrl,
    posted: String(job.publication_date ?? '').trim() || undefined,
    description: stripHtml(String(job.contents ?? '')),
    tags: [...categories, ...levels, 'TheMuse'],
  };
}

export async function fetchAllTheMuseJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];

    for (let page = 1; page <= MAX_THE_MUSE_PAGES; page += 1) {
      const url = new URL(THE_MUSE_API_BASE_URL);
      url.searchParams.set('page', String(page));

      const response = await scraperFetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'job-finder-super-scraper/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Fetch failed on page ${page}: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as TheMuseResponse;
      const jobs = Array.isArray(payload.results) ? payload.results : [];

      for (const job of jobs) {
        const mapped = mapTheMuseJob(job);
        if (mapped) {
          normalized.push(mapped);
        }
      }

      const pageCount = Number(payload.page_count ?? 0);
      const currentPage = Number(payload.page ?? page);
      if (!Number.isFinite(pageCount) || pageCount <= 0 || currentPage >= pageCount) {
        break;
      }
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('TheMuse', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[TheMuseAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
