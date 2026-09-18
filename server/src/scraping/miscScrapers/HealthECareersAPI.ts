import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from '../core/ScrapeDescriptionUtils.js';

const HEALTHECAREERS_BASE_URL = 'https://www.healthecareers.com/search-jobs';
const MAX_HEALTHECAREERS_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(HEALTHECAREERS_BASE_URL);
  if (page > 1) {
    url.searchParams.set('pg', String(page));
  }
  return url.toString();
}

function titleFromPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const slug = parts.length >= 2 ? parts[parts.length - 2] : '';
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

function parseHealthECareersJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https:\/\/www\.healthecareers\.com)?\/job\/[^"\s?#]+(?:\?[^"\s]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.healthecareers.com${rawUrl}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title || /\/employer(?:$|\?)/i.test(sourceUrl)) {
      continue;
    }

    if (/search jobs|browse jobs|saved jobs|job alert|sign in|register/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 450), from + 2600);
    const company = firstCleanMatch(context, [
      /id="job-results-employer"[^>]*>([\s\S]*?)<\/span>/i,
      /itemprop="hiringOrganization"[\s\S]*?itemprop="name"[^>]*>([\s\S]*?)<\//i,
      /class="job-vendor"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
      /(?:company|employer)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*</i,
      /(?:company|employer)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const location = firstCleanMatch(context, [
      /id="job-results-location"[^>]*>([\s\S]*?)<\/span>/i,
      /class="job-location"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      /data-location="([^"]{2,180})"/i,
      /(?:location|city|state)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*</i,
      /(?:location|city|state)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const postedMatch = context.match(/(?:posted|date)[^>]*>\s*([^<]{3,60})\s*</i);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: company || 'Health eCareers Employer',
      location: location || 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: postedMatch?.[1]?.trim(),
      description,
      tags: ['Medical', 'Healthcare'],
    });
  }

  return jobs;
}

export async function fetchAllHealthECareersJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'HealthECareers',
      maxPages: MAX_HEALTHECAREERS_PAGES,
      pageUrl,
      parseJobs: (html) => parseHealthECareersJobs(html),
      hasNextPage: (html, page) => new RegExp(`search-jobs\\?pg=${page + 1}(?:["&]|$)`, 'i').test(html),
    });

    return normalizeJobsWithCoordinates('HealthECareers', normalized);
  } catch (error) {
    console.warn('[HealthECareersAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
