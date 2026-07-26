import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';

const IMPACTPOOL_URL = 'https://www.impactpool.org/search';
const MAX_IMPACTPOOL_PAGES = 250;

function isGenericImpactPoolTitle(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === 'impactpool' || normalized === 'job' || normalized === 'jobs';
}

function extractImpactPoolTitle(anchorHtml: string): string {
  const cardTitleMatch = anchorHtml.match(/type=["']cardTitle["'][^>]*>([\s\S]*?)<\/div>/i);
  const cardTitle = stripHtmlTags(cardTitleMatch?.[1] || '');
  if (cardTitle && !isGenericImpactPoolTitle(cardTitle)) {
    return cardTitle;
  }

  const fallback = stripHtmlTags(anchorHtml);
  if (fallback && !isGenericImpactPoolTitle(fallback)) {
    return fallback;
  }

  return '';
}

function pageUrl(page: number): string {
  const url = new URL(IMPACTPOOL_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '40');
  }
  return url.toString();
}

function parseImpactPoolJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="((?:https:\/\/www\.impactpool\.org)?\/jobs\/[0-9]+(?:\/[^"?#\s]+)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.impactpool.org${rawUrl}`;
    const title = extractImpactPoolTitle(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    if (/show more|get started|join now|post a job|privacy/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 400), from + 1000);
    const companyMatch = context.match(/\b([A-Z][A-Za-z0-9&.,'()\- ]{2,80})\s+[A-Z][a-z]+\s*-\s*(?:Junior|Mid|Senior|Internship|Consultant|Level)/);
    const locationMatch = context.match(/\b([A-Za-z .'-]+)\s*\|\s*([A-Za-z .'-]+)/);

    let location = 'Unknown';
    if (locationMatch) {
      location = `${locationMatch[1].trim()} | ${locationMatch[2].trim()}`;
    }

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'ImpactPool').trim(),
      location,
      remote: /\bremote\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['ImpactPool', 'Impact', 'International Development'],
    });
  }

  return jobs;
}

export async function fetchAllImpactPoolJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'ImpactPool',
      maxPages: MAX_IMPACTPOOL_PAGES,
      pageUrl,
      parseJobs: (html) => parseImpactPoolJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`[?&]page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) || /show more/i.test(html),
    });

    return normalizeJobsWithCoordinates('ImpactPool', normalized);
  } catch (error) {
    console.warn('[ImpactPoolAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
