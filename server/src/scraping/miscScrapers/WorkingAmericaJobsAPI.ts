import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const WORKING_AMERICA_JOBS_URL = 'https://workingamerica.org/jobs/';
const MAX_WORKING_AMERICA_PAGES = 3;

function pageUrl(page: number): string {
  if (page <= 1) {
    return WORKING_AMERICA_JOBS_URL;
  }

  return `${WORKING_AMERICA_JOBS_URL}?paged=${page}`;
}

function isLikelyWorkingAmericaListingTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }

  if (/apply for a job|working america|home|jobs|goodjobs|fixmyjob|canvass jobs|digital canvass jobs/i.test(normalized)) {
    return true;
  }

  return /canvass|campaign|organizer|field|digital|community|worker|advocate|labor|service/i.test(normalized);
}

function parseWorkingAmericaJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const seenUrls = new Set<string>();
  const linkPattern = /<a[^>]+href="((?:https?:\/\/workingamerica\.org)?\/[^"'\s?#]+(?:\/)?(?:\?[^"']*)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const title = stripHtmlTags(match[2] || '').replace(/\s+/g, ' ').trim();

    if (!rawUrl || !title) {
      continue;
    }

    const sourceUrl = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://workingamerica.org${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;

    if (!/canvass|digitalcanvass|goodjobs|fixmyjob|jobs\/?$/i.test(sourceUrl)) {
      continue;
    }

    if (!isLikelyWorkingAmericaListingTitle(title)) {
      continue;
    }

    if (seenUrls.has(sourceUrl)) {
      continue;
    }

    seenUrls.add(sourceUrl);

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 300), from + 1200);
    const locationMatch = context.match(/([A-Z][A-Za-z .'-]+(?:,\s*[A-Z]{2})?)/);

    jobs.push({
      title,
      company: 'Working America',
      location: (locationMatch?.[1] || 'United States').trim(),
      remote: /remote|virtual|online/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: undefined,
      description: stripHtmlTags(context).slice(0, 500).trim(),
      tags: ['WorkingAmerica', 'PublicService', 'Labor', 'Campaign', 'Community'],
    });
  }

  return jobs;
}

export async function fetchAllWorkingAmericaJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'WorkingAmericaJobs',
      maxPages: MAX_WORKING_AMERICA_PAGES,
      pageUrl,
      parseJobs: (html) => parseWorkingAmericaJobs(html),
      hasNextPage: (html, page) =>
        page < MAX_WORKING_AMERICA_PAGES && /paged=\d+|next page|/i.test(html),
    });

    return normalizeJobsWithCoordinates('WorkingAmericaJobs', normalized);
  } catch (error) {
    console.warn('[WorkingAmericaJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
