import type { ScrapedJob } from './ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';

const HIMALAYAS_API_URL = 'https://himalayas.app/jobs/api';
const HIMALAYAS_PAGE_SIZE = 100;
const DEFAULT_MAX_HIMALAYAS_PAGES = 20;

interface HimalayasJob {
  title?: string;
  companyName?: string;
  employmentType?: string;
  locationRestrictions?: string[];
  categories?: string[];
  parentCategories?: string[];
  seniority?: string[];
  description?: string;
  pubDate?: number;
  applicationLink?: string;
  guid?: string;
}

interface HimalayasResponse {
  offset?: number;
  limit?: number;
  totalCount?: number;
  jobs?: HimalayasJob[];
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getMaxPages(): number {
  const parsed = Number.parseInt(process.env.HIMALAYAS_MAX_PAGES || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_HIMALAYAS_PAGES;
}

function mapHimalayasJob(job: HimalayasJob): NormalizedPortalJob | null {
  const title = String(job.title ?? '').trim();
  const sourceUrl = String(job.applicationLink || job.guid || '').trim();
  if (!title || !sourceUrl) {
    return null;
  }

  const locations = Array.isArray(job.locationRestrictions)
    ? job.locationRestrictions.map((location) => String(location).trim()).filter(Boolean)
    : [];
  const location = locations.join(', ') || 'Remote';
  const posted = Number.isFinite(job.pubDate) ? new Date(Number(job.pubDate) * 1000).toISOString() : undefined;

  return {
    title,
    company: String(job.companyName ?? 'Unknown Company').trim() || 'Unknown Company',
    location,
    remote: 'Remote',
    type: String(job.employmentType ?? 'Unknown').trim() || 'Unknown',
    sourceUrl,
    posted,
    description: stripHtml(String(job.description ?? '')),
    tags: [
      ...(Array.isArray(job.parentCategories) ? job.parentCategories : []),
      ...(Array.isArray(job.categories) ? job.categories : []),
      ...(Array.isArray(job.seniority) ? job.seniority : []),
      'Himalayas',
    ].filter(Boolean),
  };
}

export async function fetchAllHimalayasJobs(): Promise<ScrapedJob[]> {
  try {
    const dedup = new Map<string, NormalizedPortalJob>();

    for (let page = 0; page < getMaxPages(); page += 1) {
      const offset = page * HIMALAYAS_PAGE_SIZE;
      const url = new URL(HIMALAYAS_API_URL);
      url.searchParams.set('limit', String(HIMALAYAS_PAGE_SIZE));
      url.searchParams.set('offset', String(offset));

      const payload = (await fetchJson(url.toString())) as HimalayasResponse;
      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      for (const job of jobs) {
        const mapped = mapHimalayasJob(job);
        if (mapped) {
          dedup.set(mapped.sourceUrl, mapped);
        }
      }

      const totalCount = Number(payload.totalCount ?? 0);
      if (jobs.length === 0 || (totalCount > 0 && offset + jobs.length >= totalCount)) {
        break;
      }
    }

    return normalizeJobsWithCoordinates('Himalayas', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[HimalayasAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}