import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const JMIR_CAREERS_BASE_URL = 'https://careers.jmir.org/jobs/';
const MAX_JMIR_CAREERS_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(JMIR_CAREERS_BASE_URL);
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

function parseJmirCareersJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https:\/\/careers\.jmir\.org)?\/jobs\/\d+\/[^"\s#?]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://careers.jmir.org${rawUrl}`;
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
      company: (companyMatch?.[1] || 'JMIR Careers Employer').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Medical', 'Healthcare', 'Digital Health'],
    });
  }

  return jobs;
}

export async function fetchAllJmirCareersJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'JMIRCareers',
      maxPages: MAX_JMIR_CAREERS_PAGES,
      pageUrl,
      parseJobs: (html) => parseJmirCareersJobs(html),
      hasNextPage: (html, page) => new RegExp(`/jobs\\?page=${page + 1}(?:["&]|$)`, 'i').test(html),
    });

    return normalizeJobsWithCoordinates('JMIRCareers', normalized);
  } catch (error) {
    console.warn('[JMIRCareersAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
