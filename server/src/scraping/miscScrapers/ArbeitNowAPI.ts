import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';

const ARBEITNOW_BASE_URL = 'https://www.arbeitnow.com/api/job-board-api?limit=100&page=1';
const MAX_ARBEITNOW_PAGES = 400;

interface ArbeitnowJob {
  title?: string;
  company_name?: string;
  location?: string;
  description?: string;
  url?: string;
  tags?: string[];
  job_types?: string[];
  remote?: boolean;
  created_at?: number;
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
  links?: {
    next?: string | null;
  };
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIsoDate(seconds: number | undefined): string | undefined {
  if (!seconds || Number.isNaN(seconds)) {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString();
}

function mapArbeitnowJob(job: ArbeitnowJob): NormalizedPortalJob | null {
  const title = (job.title || '').trim();
  const sourceUrl = (job.url || '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const inputTags = Array.isArray(job.tags) ? job.tags.filter(Boolean) : [];
  const tags = inputTags.length > 0 ? [...inputTags, 'ArbeitNow'] : ['ArbeitNow'];

  return {
    title,
    company: (job.company_name || 'Unknown Company').trim(),
    location: (job.location || 'Unknown').trim(),
    remote: job.remote ? 'Remote' : 'On-site',
    type: Array.isArray(job.job_types) && job.job_types.length > 0 ? job.job_types[0] : 'Full-time',
    sourceUrl,
    posted: toIsoDate(job.created_at),
    description: stripHtmlTags(job.description || ''),
    tags,
  };
}

export async function fetchAllArbeitNowJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];
    let nextUrl: string | null = ARBEITNOW_BASE_URL;
    const visited = new Set<string>();

    for (let i = 0; i < MAX_ARBEITNOW_PAGES && nextUrl; i += 1) {
      if (visited.has(nextUrl)) {
        break;
      }
      visited.add(nextUrl);

      let payload: ArbeitnowResponse;
      try {
        payload = (await fetchJson(nextUrl)) as ArbeitnowResponse;
      } catch (error) {
        if (normalized.length === 0) {
          throw error;
        }
        console.warn(
          `[ArbeitNowAPI] Stopping pagination after partial success at ${nextUrl}: ${String(error)}`,
        );
        break;
      }

      const jobs = Array.isArray(payload.data) ? payload.data : [];

      for (const job of jobs) {
        const mapped = mapArbeitnowJob(job);
        if (mapped) {
          normalized.push(mapped);
        }
      }

      const candidate = payload.links?.next;
      nextUrl = typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('ArbeitNow', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[ArbeitNowAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
