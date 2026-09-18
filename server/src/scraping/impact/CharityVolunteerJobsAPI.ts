import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const CHARITY_VOLUNTEER_URL = 'https://www.charityjob.co.uk/volunteer-jobs/';
const MAX_CHARITY_VOLUNTEER_PAGES = 200;

function pageUrl(page: number): string {
  const url = new URL(CHARITY_VOLUNTEER_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseCharityVolunteerJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="((?:https:\/\/www\.charityjob\.co\.uk)?\/volunteer-jobs\/[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.charityjob.co.uk${rawUrl}`;
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    if (/volunteer roles|upload your cv|about us|contact us|privacy/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 400), from + 1200);
    const companyMatch = context.match(/\]\(javascript:void\(0\)\)\s*([^\n\[]+)/i);
    const locationMatch = context.match(/\)\s+([^\n\r]{2,100})\s+\(On-site|\)\s+([^\n\r]{2,100})\s+\(Hybrid|\)\s+([^\n\r]{2,100})\s+Remote/i);

    let location = 'Unknown';
    if (locationMatch) {
      location = (locationMatch[1] || locationMatch[2] || locationMatch[3] || 'Unknown').trim();
    }

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'CharityJob Volunteer').trim(),
      location,
      remote: /\bremote\b|\bhybrid\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Volunteer',
      sourceUrl,
      description: '',
      tags: ['CharityJob', 'Volunteer'],
    });
  }

  return jobs;
}

export async function fetchAllCharityVolunteerJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'CharityVolunteerJobs',
      maxPages: MAX_CHARITY_VOLUNTEER_PAGES,
      pageUrl,
      parseJobs: (html) => parseCharityVolunteerJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`\b${page + 1}\b`, 'i').test(html) || /next page|\uE905/i.test(html),
    });

    return normalizeJobsWithCoordinates('CharityVolunteerJobs', normalized);
  } catch (error) {
    console.warn('[CharityVolunteerJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
