import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { isRateLimitedScrapeError, scraperFetch } from '../core/httpCache/ScraperHttpCache.js';

const CLIMATEBASE_ALGOLIA_ENDPOINT = 'https://92153l0pag-dsn.algolia.net/1/indexes/jobs/query';
const CLIMATEBASE_ALGOLIA_APP_ID = '92153L0PAG';
const CLIMATEBASE_ALGOLIA_PUBLIC_KEY = '5f891d4e08216cb321efbd347bdf2357';
const DEFAULT_HITS_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 500;

interface ClimateBaseV2Job {
  objectID?: string;
  id?: string | number;
  title?: string;
  name_of_employer?: string;
  employer_name?: string;
  company?: string;
  locations?: string[];
  location?: string;
  remote_preferences?: string[];
  remote?: boolean;
  job_types?: string[];
  job_type?: string;
  activation_date?: string;
  date_posted?: string;
  description?: string;
  employer_short_description?: string;
  sectors?: string[];
  salary_from?: number;
  salary_to?: number;
  salary_period?: string;
  salary_currency?: string;
  url?: string;
}

interface ClimateBaseV2Response {
  hits?: ClimateBaseV2Job[];
  page?: number;
  nbPages?: number;
}

function asFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapClimateBaseV2Job(job: ClimateBaseV2Job): NormalizedPortalJob | null {
  const id = String(job.objectID ?? job.id ?? '').trim();
  const title = String(job.title ?? '').trim();
  if (!id || !title) return null;

  const locations = Array.isArray(job.locations) ? job.locations : [];
  const remotePreferences = Array.isArray(job.remote_preferences) ? job.remote_preferences : [];
  const location = String(locations[0] ?? job.location ?? 'Unknown').trim() || 'Unknown';
  const remote = job.remote || remotePreferences.some((value) => /remote/i.test(value)) ? 'Remote' : 'On-site';
  const salaryMin = asFiniteNumber(job.salary_from);
  const salaryMax = asFiniteNumber(job.salary_to);

  return {
    title,
    company: String(job.employer_name ?? job.name_of_employer ?? job.company ?? 'Unknown Company').trim() || 'Unknown Company',
    location,
    remote,
    type: String((job.job_types ?? [job.job_type ?? 'Unknown'])[0] ?? 'Unknown'),
    sourceUrl: String(job.url ?? `https://climatebase.org/job/${id}`).trim(),
    posted: String(job.activation_date ?? job.date_posted ?? '').trim() || undefined,
    salaryMin,
    salaryMax,
    salaryCurrency: String(job.salary_currency ?? (salaryMin !== undefined || salaryMax !== undefined ? 'USD' : '')).trim() || undefined,
    salaryPeriod: String(job.salary_period ?? '').trim() || undefined,
    salaryIsEstimated: false,
    description: String(job.description ?? job.employer_short_description ?? ''),
    tags: [...(job.sectors ?? []), ...remotePreferences, 'ClimateBase'],
  };
}

export async function fetchAllClimateBaseV2Jobs(): Promise<ScrapedJob[]> {
  const hitsPerPage = Math.max(1, Math.min(1_000, Number(process.env.CLIMATEBASE_V2_HITS_PER_PAGE || DEFAULT_HITS_PER_PAGE)));
  const maxPages = Math.max(1, Number(process.env.CLIMATEBASE_V2_MAX_PAGES || DEFAULT_MAX_PAGES));
  const normalized = new Map<string, NormalizedPortalJob>();
  let pageCount = 1;

  for (let page = 0; page < Math.min(pageCount, maxPages); page += 1) {
    const params = new URLSearchParams({ query: '', hitsPerPage: String(hitsPerPage), page: String(page) });
    try {
      const response = await scraperFetch(CLIMATEBASE_ALGOLIA_ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-algolia-application-id': CLIMATEBASE_ALGOLIA_APP_ID,
          'x-algolia-api-key': CLIMATEBASE_ALGOLIA_PUBLIC_KEY,
        },
        body: JSON.stringify({ params: params.toString() }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

      const payload = await response.json() as ClimateBaseV2Response;
      const hits = Array.isArray(payload.hits) ? payload.hits : [];
      for (const hit of hits) {
        const mapped = mapClimateBaseV2Job(hit);
        if (mapped) normalized.set(mapped.sourceUrl, mapped);
      }

      pageCount = Math.max(1, Number(payload.nbPages ?? page + 1));
      if (hits.length === 0) break;
    } catch (error) {
      if (isRateLimitedScrapeError(error)) {
        console.warn('[ClimateBaseV2] Rate limited by Algolia; stopping the scrape.');
      } else {
        console.warn(`[ClimateBaseV2] Failed page ${page + 1}:`, String(error));
      }
      break;
    }
  }

  console.log(`[ClimateBaseV2] Fetched ${normalized.size} jobs from Algolia.`);
  return normalizeJobsWithCoordinates('ClimateBase', Array.from(normalized.values()));
}