import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const CHARITY_PEOPLE_URL = 'https://charitypeople.co.uk/jobs/';
const MAX_CHARITY_PEOPLE_PAGES = 200;

function pageUrl(page: number): string {
  if (page <= 1) {
    return CHARITY_PEOPLE_URL;
  }
  return `${CHARITY_PEOPLE_URL}page/${page}/`;
}

function fallbackTitleFromUrl(sourceUrl: string): string {
  const slug = sourceUrl.split('/').filter(Boolean).at(-1) || '';
  return slug
    .replace(/-[0-9]+$/g, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown Role';
}

function parseCharityPeopleJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /href="((?:https:\/\/charitypeople\.co\.uk)?\/job\/[^"\s]+)"/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://charitypeople.co.uk${rawUrl}`;
    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 500), from + 1200);

    const titleFromContext = stripHtmlTags((context.match(/\]\((?:https?:\/\/)?charitypeople\.co\.uk\/job\/[^)]+\)\s*([^\n\[]+)/i)?.[1] || '').trim());
    const title = titleFromContext || fallbackTitleFromUrl(sourceUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    if (/find your next job|register your cv|looking for a new role|close menu/i.test(title)) {
      continue;
    }

    const locationMatch = context.match(/\b([A-Za-z .'-]+(?:,\s*[A-Za-z .'-]+)?)\s+(?:Full Time|Part Time|Contract|Temporary|Permanent)\b/i);

    jobs.push({
      title,
      company: 'Charity People',
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /remote|homebased|hybrid/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['CharityPeople', 'Charity'],
    });
  }

  return jobs;
}

export async function fetchAllCharityPeopleJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'CharityPeople',
      maxPages: MAX_CHARITY_PEOPLE_PAGES,
      pageUrl,
      parseJobs: (html) => parseCharityPeopleJobs(html),
      hasNextPage: (html, page) =>
        /\b→\b|next/i.test(html) || new RegExp(`\\b${page + 1}\\b`).test(html),
    });

    return normalizeJobsWithCoordinates('CharityPeople', normalized);
  } catch (error) {
    console.warn('[CharityPeopleAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
