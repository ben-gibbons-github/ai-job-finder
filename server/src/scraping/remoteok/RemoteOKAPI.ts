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

export async function fetchAllRemoteOkJobs(): Promise<ScrapedJob[]> {
  try {
    const payload = (await fetchJson('https://remoteok.com/api')) as unknown[];
    const jobs = Array.isArray(payload) ? payload.slice(1) : [];
    const normalized = jobs
      .filter((job) => Boolean((job as RemoteOkJob)?.url))
      .map((job) => parseRemoteOkJob(job as RemoteOkJob));

    return normalizeJobsWithCoordinates('RemoteOK', normalized);
  } catch (error) {
    console.warn('[RemoteOKAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
