import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';

const GET_ON_BOARD_API_URL = 'https://www.getonbrd.com/api/v0/jobs';
const MAX_GET_ON_BOARD_PAGES = 20;
const GET_ON_BOARD_PAGE_SIZE = 100;

interface GetOnBoardCompany {
  name?: string;
}

interface GetOnBoardJob {
  title?: string;
  company?: string | GetOnBoardCompany;
  location?: string;
  location_name?: string;
  remote?: boolean;
  type?: string;
  job_types?: string[];
  contract_type?: string;
  url?: string;
  apply_url?: string;
  created_at?: string;
  description?: string;
  tags?: string[];
}

interface GetOnBoardResponse {
  jobs?: GetOnBoardJob[];
  data?: GetOnBoardJob[];
  results?: GetOnBoardJob[];
  items?: GetOnBoardJob[];
  page?: number;
  total_pages?: number;
  totalPages?: number;
}

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRows(payload: unknown): GetOnBoardJob[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const candidates = [root.jobs, root.data, root.results, root.items];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as GetOnBoardJob[];
    }
  }

  return [];
}

function mapGetOnBoardJob(job: GetOnBoardJob): NormalizedPortalJob | null {
  const title = String(job.title ?? '').trim();
  const sourceUrl = String(job.url ?? job.apply_url ?? '').trim();

  if (!title || !sourceUrl) {
    return null;
  }

  const companyName = typeof job.company === 'string'
    ? job.company
    : (job.company as GetOnBoardCompany | undefined)?.name ?? 'Unknown Company';

  const preferredLocation = String(job.location ?? job.location_name ?? 'Remote').trim() || 'Remote';
  const description = stripHtml(String(job.description ?? ''));
  const jobTypes = Array.isArray(job.job_types) ? job.job_types.filter(Boolean) : [];
  const tags = Array.isArray(job.tags) ? job.tags.filter(Boolean) : [];
  const inferredType = [String(job.type ?? '').trim(), ...jobTypes, String(job.contract_type ?? '').trim()]
    .filter(Boolean)
    .join(' / ') || 'Full-time';

  return {
    title,
    company: companyName.trim() || 'Unknown Company',
    location: preferredLocation,
    remote: typeof job.remote === 'boolean'
      ? (job.remote ? 'Remote' : 'Unknown')
      : /remote|anywhere/i.test(`${title} ${preferredLocation} ${description}`)
        ? 'Remote'
        : 'Unknown',
    type: inferredType,
    sourceUrl,
    posted: String(job.created_at ?? '').trim() || undefined,
    description,
    tags: [...tags, ...jobTypes, 'GetOnBoard'].filter(Boolean),
  };
}

export async function fetchAllGetOnBoardJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];

    for (let page = 1; page <= MAX_GET_ON_BOARD_PAGES; page += 1) {
      const url = new URL(GET_ON_BOARD_API_URL);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(GET_ON_BOARD_PAGE_SIZE));

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'job-finder-super-scraper/1.0',
        },
      });

      if (!response.ok) {
        if (page === 1) {
          throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }
        break;
      }

      const payload = (await response.json()) as GetOnBoardResponse;
      const jobs = extractRows(payload);

      if (jobs.length === 0) {
        break;
      }

      for (const job of jobs) {
        const mapped = mapGetOnBoardJob(job);
        if (mapped) {
          normalized.push(mapped);
        }
      }

      const totalPages = Number(payload.total_pages ?? payload.totalPages ?? 0);
      const currentPage = Number(payload.page ?? page);
      if (!Number.isFinite(totalPages) || totalPages <= 0 || currentPage >= totalPages) {
        break;
      }
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('GetOnBoard', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[GetOnBoardAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
