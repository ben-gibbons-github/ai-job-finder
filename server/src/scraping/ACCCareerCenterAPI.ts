import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const ACC_CAREER_CENTER_BASE_URL = 'https://careers.acc.org/jobs/';
const MAX_ACC_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(ACC_CAREER_CENTER_BASE_URL);
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

function parseAccJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const decodedHtml = html.replace(/\\\//g, '/');
  const jobsPattern = /<a[^>]+href="((?:https:\/\/careers\.acc\.org)?\/jobs\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const jobPattern = /<a[^>]+href="((?:https:\/\/careers\.acc\.org)?\/job\/[^"]+\/\d+\/?(?:\?[^"\s]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const pattern of [jobsPattern, jobPattern]) {
    for (const match of decodedHtml.matchAll(pattern)) {
      const rawUrl = (match[1] || '').trim();
      const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://careers.acc.org${rawUrl}`;
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
        company: 'ACC Employer',
        location: 'Unknown',
        remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
        type: 'Unknown',
        sourceUrl,
        description,
        tags: ['Medical', 'Cardiology', 'Healthcare'],
      });
    }
  }

  return jobs;
}

export async function fetchAllAccCareerCenterJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'ACCCareerCenter',
      maxPages: MAX_ACC_PAGES,
      pageUrl,
      parseJobs: (html) => parseAccJobs(html),
      hasNextPage: (html, page) => new RegExp(`(?:\\?|&)page=${page + 1}(?:["'&]|$)`, 'i').test(html.replace(/\\\//g, '/')),
    });

    return normalizeJobsWithCoordinates('ACCCareerCenter', normalized);
  } catch (error) {
    console.warn('[ACCCareerCenterAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
