import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';

const TRELLIS_JOBS_URL = 'https://jobs.trellis.net/';
const MAX_TRELLIS_PAGES = 120;

function pageUrl(page: number): string {
  const url = new URL(TRELLIS_JOBS_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseTrellisJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];

  if (/attention required|just a moment|cf-browser-verification/i.test(html)) {
    console.warn('[TrellisAPI] Trellis returned a Cloudflare challenge page; skipping parse for this run.');
    return jobs;
  }

  const readMorePattern =
    /<a[^>]+href="(https:\/\/jobs\.trellis\.net\/[^"\s?#]+(?:\?[^"\s]*)?)"[^>]*>\s*Read more about\s*([\s\S]*?)\s*at\s*([\s\S]*?)<\/a>/gi;

  const matches = Array.from(html.matchAll(readMorePattern));

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const sourceUrl = String(match[1] ?? '').trim();
    const title = stripHtmlTags(String(match[2] ?? ''));
    const company = stripHtmlTags(String(match[3] ?? ''));

    if (!sourceUrl || !title || !company) {
      continue;
    }

    if (/post a job|terms|privacy|newsletter|sustainability jobs/i.test(`${title} ${company}`)) {
      continue;
    }

    const contextStart = match.index ?? 0;
    const contextEnd = (matches[index + 1]?.index ?? (contextStart + 2500));
    const context = html.slice(contextStart, Math.min(html.length, contextEnd));

    const applyMatch = context.match(/<a[^>]+href="([^"]+)"[^>]*>\s*Apply for\b/i);
    const applyUrl = String(applyMatch?.[1] ?? '').trim();

    const locationMatch = context.match(/\b([A-Z][A-Za-z .'-]+,\s*(?:[A-Z]{2}|District of Columbia|United States))(?:\s*\d+\s*(?:day|week|month)s?\s*ago)?/i);
    const location = stripHtmlTags(locationMatch?.[1] ?? '') || 'Unknown';

    jobs.push({
      title,
      company,
      location,
      remote: /\bremote\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['Trellis', 'Sustainability', 'Climate'],
    });

    if (applyUrl) {
      jobs[jobs.length - 1].description = `Apply: ${applyUrl}`;
    }
  }

  return jobs;
}

export async function fetchAllTrellisJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'Trellis',
      maxPages: MAX_TRELLIS_PAGES,
      pageUrl,
      parseJobs: (html) => parseTrellisJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`(?:\\?|&)page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) || /\bnext\b/i.test(html),
    });

    return normalizeJobsWithCoordinates('Trellis', normalized);
  } catch (error) {
    console.warn('[TrellisAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
