import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext, extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

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
    const context = decodedHtml.slice(Math.max(0, from - 500), from + 2600);
    const company = firstCleanMatch(context, [
      /id="job-results-employer"[^>]*>([\s\S]*?)<\/span>/i,
      /itemprop="hiringOrganization"[\s\S]*?itemprop="name"[^>]*>([\s\S]*?)<\//i,
      /"hiringOrganization"\s*:\s*\{[^{}]*"name"\s*:\s*"([^"]{2,180})"/i,
      /class="[^"]*job-vendor[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
      /class="[^"]*(?:company|employer)[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
      /(?:company|employer)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*<\/span>/i,
      /(?:company|employer)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const location = firstCleanMatch(context, [
      /id="job-results-location"[^>]*>([\s\S]*?)<\/span>/i,
      /class="[^"]*job-location[^"]*"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      /"addressLocality"\s*:\s*"([^"]{2,180})"/i,
      /"jobLocation"\s*:\s*\{[\s\S]*?"address"\s*:\s*\{[\s\S]*?"addressLocality"\s*:\s*"([^"]{2,180})"/i,
      /data-location="([^"]{2,180})"/i,
      /(?:location|city|state)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*<\/span>/i,
      /(?:location|city|state)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: company || 'RSNA Employer',
      location: location || 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Medical', 'Radiology', 'Imaging', 'Healthcare'],
    });
  }

  return jobs;
}

async function hydrateRsnaDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
  const hydrated: NormalizedPortalJob[] = [];

  for (const job of jobs) {
    let description = job.description?.trim() || '';
    if (!description) {
      const detailHtml = await fetchHtml(job.sourceUrl);
      if (detailHtml) {
        description = extractDescriptionFromHtml(detailHtml, job.title, 2000);
      }
    }

    hydrated.push({ ...job, description });
  }

  return hydrated;
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

    const hydrated = await hydrateRsnaDescriptions(normalized);
    return normalizeJobsWithCoordinates('RSNACareerConnect', hydrated);
  } catch (error) {
    console.warn('[RSNACareerConnectAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
