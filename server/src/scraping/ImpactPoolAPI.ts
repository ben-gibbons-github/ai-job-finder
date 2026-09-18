import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs } from './PaginatedHtmlScrapeUtils.js';
import { sanitizeJobDescription } from './ScrapeDescriptionUtils.js';

const IMPACTPOOL_URL = 'https://www.impactpool.org/search';
const MAX_IMPACTPOOL_PAGES = 250;

function isGenericImpactPoolTitle(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === 'impactpool' || normalized === 'job' || normalized === 'jobs';
}

function extractImpactPoolTitle(anchorHtml: string): string {
  const cardTitleMatch = anchorHtml.match(/type=["']cardTitle["'][^>]*>([\s\S]*?)<\/div>/i);
  const cardTitle = sanitizeJobDescription(cardTitleMatch?.[1] || '');
  if (cardTitle && !isGenericImpactPoolTitle(cardTitle)) {
    return cardTitle;
  }

  const fallback = sanitizeJobDescription(anchorHtml);
  if (fallback && !isGenericImpactPoolTitle(fallback)) {
    return fallback;
  }

  return '';
}

function extractImpactPoolBodyFields(anchorHtml: string): string[] {
  return Array.from(anchorHtml.matchAll(/<div[^>]+type=["']bodyEmphasis["'][^>]*>([\s\S]*?)<\/div>/gi))
    .map((match) => sanitizeJobDescription(match[1] || ''))
    .filter(Boolean);
}

function pageUrl(page: number): string {
  const url = new URL(IMPACTPOOL_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '40');
  }
  return url.toString();
}

export function parseImpactPoolJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href=["']((?:https:\/\/www\.impactpool\.org)?\/jobs\/[0-9]+(?:\/[^"'?#\s]+)?)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.impactpool.org${rawUrl}`;
    const anchorHtml = match[2] || '';
    const title = extractImpactPoolTitle(anchorHtml);

    if (!sourceUrl || !title) {
      continue;
    }

    if (/show more|get started|join now|post a job|privacy/i.test(title)) {
      continue;
    }

    const bodyFields = extractImpactPoolBodyFields(anchorHtml);
    const company = bodyFields[0] || 'Unknown Company';
    const location = bodyFields[1] || 'Unknown';
    const seniority = bodyFields[2] || 'Unknown';

    jobs.push({
      title,
      company,
      location,
      remote: /\bremote\b/i.test(location) ? 'Remote' : 'Unknown',
      type: seniority,
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
