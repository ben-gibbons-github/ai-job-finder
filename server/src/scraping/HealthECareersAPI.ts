import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

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
    const context = html.slice(Math.max(0, from - 250), from + 1400);
    const companyMatch = context.match(/(?:company|employer)[^>]*>\s*([^<]{2,140})\s*</i);
    const locationMatch = context.match(/(?:location|city|state)[^>]*>\s*([^<]{2,140})\s*</i);
    const postedMatch = context.match(/(?:posted|date)[^>]*>\s*([^<]{3,60})\s*</i);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'Health eCareers Employer').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
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
