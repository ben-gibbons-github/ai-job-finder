import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';

interface RemoteOkJob {
  position?: string;
  company?: string;
  location?: string;
  date?: string;
  url?: string;
  tags?: string[];
  description?: string;
}

function parseRemoteOkJob(job: RemoteOkJob): NormalizedPortalJob {
  return {
    title: job.position || 'Unknown Role',
    company: job.company || 'Unknown Company',
    location: job.location || 'Remote',
    remote: 'Remote',
    type: 'Full-time',
    sourceUrl: job.url || 'https://remoteok.com/',
    posted: job.date,
    description: job.description || '',
    tags: Array.isArray(job.tags) ? job.tags : [],
  };
}

function isOperationsRole(job: RemoteOkJob): boolean {
  const position = String(job.position || '').toLowerCase();
  const tags = Array.isArray(job.tags) ? job.tags.map((x) => String(x).toLowerCase()).join(' ') : '';
  const haystack = `${position} ${tags}`;

  return /operations|ops\b|chief of staff|program manager|project manager|business operations|revenue operations/.test(haystack);
}

export async function fetchAllRemoteOkOperationsJobs(): Promise<ScrapedJob[]> {
  try {
    const payload = (await fetchJson('https://remoteok.com/api')) as unknown[];
    const jobs = Array.isArray(payload) ? payload.slice(1) : [];
    const normalized = jobs
      .map((job) => job as RemoteOkJob)
      .filter((job) => Boolean(job.url) && isOperationsRole(job))
      .map((job) => parseRemoteOkJob(job));

    return normalizeJobsWithCoordinates('RemoteOKOperations', normalized);
  } catch (error) {
    console.warn('[RemoteOKOperationsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
