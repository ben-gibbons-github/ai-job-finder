import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const RSNA_CAREER_CONNECT_BASE_URL = 'https://jobs.rsna.org/jobs/';
const MAX_RSNA_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(RSNA_CAREER_CONNECT_BASE_URL);
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

function parseRsnaJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const decodedHtml = html.replace(/\\\//g, '/');
  const linkPattern = /<a[^>]+href="((?:https:\/\/jobs\.rsna\.org)?\/(?:jobs|job\/view)\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of decodedHtml.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://jobs.rsna.org${rawUrl}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    if (/browse jobs|view all jobs|job alerts|saved jobs|sign in/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = decodedHtml.slice(Math.max(0, from - 350), from + 1600);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: 'RSNA Employer',
      location: 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Medical', 'Radiology', 'Imaging', 'Healthcare'],
    });
  }

  return jobs;
}

export async function fetchAllRsnaCareerConnectJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'RSNACareerConnect',
      maxPages: MAX_RSNA_PAGES,
      pageUrl,
      parseJobs: (html) => parseRsnaJobs(html),
      hasNextPage: (html, page) => new RegExp(`(?:\\?|&)page=${page + 1}(?:["'&]|$)`, 'i').test(html.replace(/\\\//g, '/')),
    });

    return normalizeJobsWithCoordinates('RSNACareerConnect', normalized);
  } catch (error) {
    console.warn('[RSNACareerConnectAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
