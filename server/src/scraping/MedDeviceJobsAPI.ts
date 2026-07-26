import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const MED_DEVICE_JOBS_BASE_URL = 'https://www.meddevicejobs.com/jobs/';
const MAX_MED_DEVICE_JOBS_PAGES = 500;

function pageUrl(page: number): string {
  if (page <= 1) {
    return MED_DEVICE_JOBS_BASE_URL;
  }
  return `https://www.meddevicejobs.com/jobs/page/${page}/`;
}

function titleFromPath(path: string): string {
  const slug = path.split('/').filter(Boolean).pop() || '';
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 18)
    .join(' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseMedDeviceJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https:\/\/www\.meddevicejobs\.com)?\/jobs\/(?!page\/|search\/|browse\/|explore\/|alerts\/|saved\/)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.meddevicejobs.com${rawUrl}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    if (/browse jobs|view all jobs|job alerts|saved jobs|sign in|register/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 320), from + 1400);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: 'MedDeviceJobs Employer',
      location: 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Medical Device', 'Biotech', 'Healthcare'],
    });
  }

  return jobs;
}

export async function fetchAllMedDeviceJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'MedDeviceJobs',
      maxPages: MAX_MED_DEVICE_JOBS_PAGES,
      pageUrl,
      parseJobs: (html) => parseMedDeviceJobs(html),
      hasNextPage: (html, page) => new RegExp(`/jobs/page/${page + 1}/(?:["?#]|$)`, 'i').test(html),
    });

    return normalizeJobsWithCoordinates('MedDeviceJobs', normalized);
  } catch (error) {
    console.warn('[MedDeviceJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
