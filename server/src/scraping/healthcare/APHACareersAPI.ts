import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext, extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const APHA_CAREERS_BASE_URL = 'https://careers.apha.org/jobs/';
const MAX_APHA_CAREERS_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(APHA_CAREERS_BASE_URL);
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

export function parseAphaCareersJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https:\/\/careers\.apha\.org)?\/jobs\/\d+\/[^"\s#?]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://careers.apha.org${rawUrl}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    if (/browse jobs|view all jobs|job alerts|saved jobs|sign in/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 450), from + 2600);
    const company = firstCleanMatch(context, [
      /id="job-results-employer"[^>]*>([\s\S]*?)<\/span>/i,
      /itemprop="hiringOrganization"[\s\S]*?itemprop="name"[^>]*>([\s\S]*?)<\//i,
      /class="job-vendor"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
      /(?:company|employer)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*<\/span>/i,
      /(?:company|employer)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const location = firstCleanMatch(context, [
      /id="job-results-location"[^>]*>([\s\S]*?)<\/span>/i,
      /class="job-location"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      /data-location="([^"]{2,180})"/i,
      /(?:location|city|state)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*<\/span>/i,
      /(?:location|city|state)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: company || 'APHA Careers Employer',
      location: location || 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Medical', 'Public Health', 'Healthcare'],
    });
  }

  return jobs;
}

async function hydrateAphaDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
  const hydrated: NormalizedPortalJob[] = [];

  for (const job of jobs) {
    let description = job.description?.trim() || '';
    if (!description) {
      const detailHtml = await fetchHtml(job.sourceUrl);
      if (detailHtml) {
        description = extractDescriptionFromHtml(detailHtml, job.title, 2000);
      }
    }

    hydrated.push({
      ...job,
      description,
    });
  }

  return hydrated;
}

export async function fetchAllAphaCareersJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'APHACareers',
      maxPages: MAX_APHA_CAREERS_PAGES,
      pageUrl,
      parseJobs: (html) => parseAphaCareersJobs(html),
      hasNextPage: (html, page) => new RegExp(`/jobs\\?page=${page + 1}(?:["&]|$)`, 'i').test(html),
    });

    const hydrated = await hydrateAphaDescriptions(normalized);
    return normalizeJobsWithCoordinates('APHACareers', hydrated);
  } catch (error) {
    console.warn('[APHACareersAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
