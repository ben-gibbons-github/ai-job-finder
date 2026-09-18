import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const IDEALIST_VOLUNTEER_BASE_URL = 'https://www.idealist.org/en/volunteer-opportunities';
const MAX_IDEALIST_VOLUNTEER_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(IDEALIST_VOLUNTEER_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function titleFromPath(path: string): string {
  const slug = path.split('/').pop() || '';
  const noId = slug.replace(/^[a-f0-9]{24,40}-/i, '');
  return noId
    .split('-')
    .filter(Boolean)
    .slice(0, 12)
    .join(' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function firstCleanMatch(context: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const value = stripHtmlTags(context.match(pattern)?.[1] || '').replace(/&amp;/gi, '&').trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseIdealistVolunteerOpportunities(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="(\/en\/volunteer-opportunity\/[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const path = (match[1] || '').trim();
    const sourceUrl = `https://www.idealist.org${path}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(path);

    if (!sourceUrl || !title) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 700), from + 2200);
    const host = firstCleanMatch(context, [
      /data-qa-id="search-result-link"[\s\S]*?<\/h3>\s*<h4[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/i,
      /<h4[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/h4>/i,
      /(?:organization|organisation|host|company|employer)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*<\/span>/i,
      /(?:organization|organisation|host|company|employer)[^>]*>\s*([^<]{2,180})\s*</i,
    ]);
    const location = firstCleanMatch(context, [
      /aria-label="location-filled icon"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      /<span[^>]*class="[^"]*sc-1ptiz4-2[^"]*"[^>]*>\s*([A-Za-z][^<]{2,120},\s*[A-Za-z][^<]{1,80})\s*<\/span>/i,
    ]);

    jobs.push({
      title,
      company: host || 'Idealist Volunteer Host',
      location: location || 'Unknown',
      remote: /\bremote\b|\bvirtual\b|\bonline\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Volunteer',
      sourceUrl,
      description: '',
      tags: ['Idealist', 'Volunteer'],
    });
  }

  return jobs;
}

export async function fetchAllIdealistVolunteerOpportunities(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'IdealistVolunteerOpportunities',
      maxPages: MAX_IDEALIST_VOLUNTEER_PAGES,
      pageUrl,
      parseJobs: (html) => parseIdealistVolunteerOpportunities(html),
    });

    return normalizeJobsWithCoordinates('IdealistVolunteerOpportunities', normalized);
  } catch (error) {
    console.warn('[IdealistVolunteerOpportunitiesAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
