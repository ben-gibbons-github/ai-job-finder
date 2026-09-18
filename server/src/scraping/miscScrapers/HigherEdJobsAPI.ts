import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const HIGHEREDJOBS_BASE_URL = 'https://www.higheredjobs.com/search/searchresults.cfm';
const MAX_HIGHEREDJOBS_PAGES = 70;

function pageUrl(page: number): string {
  const url = new URL(HIGHEREDJOBS_BASE_URL);
  url.searchParams.set('Page', String(page));
  url.searchParams.set('SearchType', 'search');
  return url.toString();
}

function parseHigherEdJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https?:\/\/www\.higheredjobs\.com)?\/[^"'\s]*?(?:job|position)[^"'\s]*?(?:\.cfm)?(?:\?[^"']*)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const title = stripHtmlTags(match[2] || '').replace(/\s+/g, ' ').trim();

    if (!rawUrl || !title || /search results|job alert|sign in|faq|contact|help|search/i.test(title)) {
      continue;
    }

    const sourceUrl = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : new URL(rawUrl, 'https://www.higheredjobs.com').toString();

    if (!/job|position/i.test(sourceUrl)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 350), from + 1800);
    const companyMatch = context.match(/(?:Employer|Institution|Organization|School|College|University|Department)[^<]{0,80}>([^<]{2,120})/i)
      ?? context.match(/(?:at|with)\s+([A-Z][A-Za-z0-9&.,'() -]{2,90})(?:\s*<|\s*\|)/i)
      ?? context.match(/([A-Z][A-Za-z0-9&.,'() -]{2,90})\s*(?:[-–—]\s*(?:Faculty|Staff|Teacher|Professor|Director|Coordinator|Advisor|Manager))/i);
    const locationMatch = context.match(/(?:Location|City|State|Region)[^<]{0,80}>([^<]{2,120})/i)
      ?? context.match(/\b([A-Za-z .'-]+,\s*[A-Z]{2})\b/i)
      ?? context.match(/\b([A-Za-z .'-]+,\s*[A-Za-z .'-]+(?:,\s*[A-Z]{2})?)\b/i);

    const company = (companyMatch?.[1] || 'HigherEdJobs employer').trim();
    const location = (locationMatch?.[1] || 'Unknown').trim();
    const description = stripHtmlTags(context).slice(0, 600).trim();

    jobs.push({
      title,
      company,
      location,
      remote: /remote|hybrid|online|virtual/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: undefined,
      description,
      tags: ['HigherEd', 'Education', 'Humanities', 'PublicService'],
    });
  }

  return jobs;
}

export async function fetchAllHigherEdJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'HigherEdJobs',
      maxPages: MAX_HIGHEREDJOBS_PAGES,
      pageUrl,
      parseJobs: (html) => parseHigherEdJobs(html),
      hasNextPage: (html) => /Page\s*=\s*\d+|next\s*page|next|page\s*=\s*\d+/i.test(html),
    });

    return normalizeJobsWithCoordinates('HigherEdJobs', normalized);
  } catch (error) {
    console.warn('[HigherEdJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
