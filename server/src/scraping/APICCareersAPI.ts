import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const APIC_CAREERS_BASE_URL = 'https://careers.apic.org/jobs/';
const MAX_APIC_CAREERS_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(APIC_CAREERS_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function titleFromPath(path: string): string {
  const slug = path.split('/').filter(Boolean).pop() || '';
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 16)
    .join(' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseApicCareersJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https:\/\/careers\.apic\.org)?\/jobs\/\d+\/[^"\s#?]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://careers.apic.org${rawUrl}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    if (/browse jobs|view all jobs|job alerts|saved jobs|sign in/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 350), from + 1600);
    const companyMatch = context.match(/(?:company|employer)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,160})\s*</i);
    const locationMatch = context.match(/(?:location)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,160})\s*</i);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'APIC Careers Employer').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Medical', 'Infection Prevention', 'Healthcare'],
    });
  }

  return jobs;
}

export async function fetchAllApicCareersJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'APICCareers',
      maxPages: MAX_APIC_CAREERS_PAGES,
      pageUrl,
      parseJobs: (html) => parseApicCareersJobs(html),
      hasNextPage: (html, page) => new RegExp(`/jobs\\?page=${page + 1}(?:["&]|$)`, 'i').test(html),
    });

    return normalizeJobsWithCoordinates('APICCareers', normalized);
  } catch (error) {
    console.warn('[APICCareersAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
