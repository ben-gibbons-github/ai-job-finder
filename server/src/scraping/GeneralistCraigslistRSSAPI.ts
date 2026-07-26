import type { ScrapedJob } from './ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';

const DEFAULT_CRAIGSLIST_AREAS = [
  'newyork',
  'losangeles',
  'chicago',
  'dallas',
  'houston',
  'phoenix',
  'philadelphia',
  'washingtondc',
  'miami',
  'atlanta',
  'boston',
  'seattle',
  'sfbay',
  'sandiego',
  'denver',
  'minneapolis',
  'detroit',
  'tampa',
  'orlando',
  'charlotte',
];

const DEFAULT_CRAIGSLIST_CATEGORIES = ['jjj'];
const MAX_JOBS_PER_FEED = 250;

class HttpStatusError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isBlockedStatus(status: number): boolean {
  return status === 403 || status === 404 || status === 429;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value: string): string {
  return decodeXmlEntities(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractLocationFromTitle(title: string): string | undefined {
  const inParens = title.match(/\(([^()]{2,80})\)\s*$/)?.[1]?.trim();
  if (inParens) {
    return inParens;
  }

  const hyphenLoc = title.match(/\s+-\s+([^\-]{2,80})$/)?.[1]?.trim();
  return hyphenLoc || undefined;
}

function parseCraigslistRss(xml: string, area: string, category: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    if (jobs.length >= MAX_JOBS_PER_FEED) {
      break;
    }

    const item = match[1] || '';
    const rawTitle = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const sourceUrl = stripHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const posted = stripHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

    if (!rawTitle || !sourceUrl) {
      continue;
    }

    const location = extractLocationFromTitle(rawTitle) || area;
    const title = rawTitle.replace(/\s*\(([^()]{2,80})\)\s*$/, '').trim();

    jobs.push({
      title,
      company: 'Craigslist Employer',
      location,
      remote: /remote|work from home|wfh/i.test(`${rawTitle} ${description}`) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: posted || undefined,
      description,
      tags: ['Craigslist', area, category],
    });
  }

  return jobs;
}

function buildCraigslistRssUrl(area: string, category: string): string {
  return `https://${encodeURIComponent(area)}.craigslist.org/search/${encodeURIComponent(category)}?format=rss`;
}

async function fetchCraigslistFeed(area: string, category: string): Promise<NormalizedPortalJob[]> {
  const url = buildCraigslistRssUrl(area, category);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/rss+xml,application/xml,text/xml',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      throw new HttpStatusError(response.status, `Fetch failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return parseCraigslistRss(xml, area, category);
  } catch (error) {
    if (error instanceof HttpStatusError) {
      throw error;
    }
    console.warn(`[GeneralistCraigslistRSSAPI] Failed feed ${area}/${category}:`, String(error));
    return [];
  }
}

export async function fetchAllGeneralistCraigslistRssJobs(): Promise<ScrapedJob[]> {
  const envAreas = parseCsvEnv(process.env.CRAIGSLIST_AREAS);
  const envCategories = parseCsvEnv(process.env.CRAIGSLIST_CATEGORIES);

  const areas = envAreas.length > 0 ? envAreas : DEFAULT_CRAIGSLIST_AREAS;
  const categories = envCategories.length > 0 ? envCategories : DEFAULT_CRAIGSLIST_CATEGORIES;

  const normalized: NormalizedPortalJob[] = [];
  let blocked = false;

  for (const area of areas) {
    if (blocked) {
      break;
    }

    for (const category of categories) {
      try {
        const rows = await fetchCraigslistFeed(area, category);
        normalized.push(...rows);
      } catch (error) {
        if (error instanceof HttpStatusError && isBlockedStatus(error.status)) {
          console.warn(
            `[GeneralistCraigslistRSSAPI] Stopping after ${error.status} bot-protection block on ${area}/${category}.`,
          );
          blocked = true;
          break;
        }

        console.warn(`[GeneralistCraigslistRSSAPI] Failed feed ${area}/${category}:`, String(error));
      }
    }
  }

  const dedup = new Map<string, NormalizedPortalJob>();
  for (const row of normalized) {
    dedup.set(row.sourceUrl, row);
  }

  return normalizeJobsWithCoordinates('GeneralistCraigslistRSS', Array.from(dedup.values()));
}
