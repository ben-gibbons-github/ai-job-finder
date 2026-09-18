import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from '../core/ScrapeDescriptionUtils.js';

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

function firstCleanMatch(context: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = context.match(pattern);
    const value = stripHtmlTags(match?.[1] || '').replace(/&amp;/gi, '&').trim();
    if (value) {
      return value;
    }
  }

  return undefined;
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
    const context = html.slice(Math.max(0, from - 500), from + 2200);
    const company = firstCleanMatch(context, [
      /<a[^>]*class="post-company\s+meta-tag"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i,
      /<a[^>]*href="[^"]*\/company\/[^"/]+\/?"[^>]*class="post-company\s+meta-tag"[^>]*>([\s\S]*?)<\/a>/i,
      /<a[^>]*class="post-company\s+meta-tag"[^>]*>([\s\S]*?)<\/a>/i,
      /(?:company|employer)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const location = firstCleanMatch(context, [
      /<a[^>]*class="post-location\s+meta-tag"[^>]*>([\s\S]*?)<\/a>/i,
      /<a[^>]*href="[^"]*\/jobs-in\/[^"/]+\/?"[^>]*>([\s\S]*?)<\/a>/i,
      /(?:location|city|state)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: company || 'MedDeviceJobs Employer',
      location: location || 'Unknown',
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
