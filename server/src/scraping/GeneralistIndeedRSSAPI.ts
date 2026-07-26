import type { ScrapedJob } from './ScrapedJob.js';
import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';

const DEFAULT_INDEED_RSS_QUERIES = getSharedJobTitleKeywords([
  'software engineer',
  'registered nurse',
  'customer service representative',
  'operations manager',
  'project manager',
]);

const DEFAULT_INDEED_RSS_LOCATIONS = [
  'United States',
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'Houston, TX',
  'Atlanta, GA',
  'Phoenix, AZ',
  'Dallas, TX',
  'Austin, TX',
  'Miami, FL',
  'Seattle, WA',
  'San Francisco, CA',
  'Boston, MA',
  'Denver, CO',
  'Remote',
];

const DEFAULT_INDEED_MAX_QUERIES = 140;
const MAX_INDEED_COMBINATIONS = Math.max(
  1,
  Number(process.env.INDEED_RSS_MAX_COMBINATIONS || 2500),
);
const MAX_JOBS_PER_QUERY = 120;

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

function splitTitleParts(title: string): { role: string; company: string } {
  const parts = title.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      role: parts[0],
      company: parts[1],
    };
  }

  return {
    role: title,
    company: 'Indeed Employer',
  };
}

function parseIndeedRss(xml: string, queryTag: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    if (jobs.length >= MAX_JOBS_PER_QUERY) {
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

    const { role, company } = splitTitleParts(rawTitle);
    const locationHint = description.match(/(?:Location|From)\s*:\s*([^\|\n\r]{2,120})/i)?.[1]?.trim();
    const remoteHint = /remote|work from home|wfh/i.test(`${rawTitle} ${description}`);

    jobs.push({
      title: role,
      company,
      location: locationHint || (remoteHint ? 'Remote' : 'Unknown'),
      remote: remoteHint ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: posted || undefined,
      description,
      tags: ['Indeed', 'Generalist', queryTag],
    });
  }

  return jobs;
}

function buildIndeedRssUrl(query: string, location: string): string {
  const url = new URL('https://www.indeed.com/rss');
  url.searchParams.set('q', query);
  url.searchParams.set('l', location);
  url.searchParams.set('sort', 'date');
  return url.toString();
}

async function fetchIndeedQueryJobs(query: string, location: string): Promise<NormalizedPortalJob[]> {
  const url = buildIndeedRssUrl(query, location);

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
    return parseIndeedRss(xml, query);
  } catch (error) {
    if (error instanceof HttpStatusError) {
      throw error;
    }
    console.warn(`[GeneralistIndeedRSSAPI] Failed query "${query}":`, String(error));
    return [];
  }
}

export async function fetchAllGeneralistIndeedRssJobs(): Promise<ScrapedJob[]> {
  const envQueries = parseCsvEnv(process.env.INDEED_RSS_QUERIES);
  const maxQueries = Math.max(1, Number(process.env.INDEED_RSS_MAX_QUERIES || DEFAULT_INDEED_MAX_QUERIES));
  const queries = capKeywords(envQueries.length > 0 ? envQueries : DEFAULT_INDEED_RSS_QUERIES, maxQueries);
  const envLocations = parseCsvEnv(process.env.INDEED_RSS_LOCATIONS);
  const singleLocation = String(process.env.INDEED_RSS_LOCATION || '').trim();
  const locations =
    envLocations.length > 0
      ? envLocations
      : singleLocation.length > 0
        ? [singleLocation]
        : DEFAULT_INDEED_RSS_LOCATIONS;

  const combinations: Array<{ query: string; location: string }> = [];
  for (const query of queries) {
    for (const location of locations) {
      combinations.push({ query, location });
    }
  }

  const normalized: NormalizedPortalJob[] = [];
  const boundedCombinations = combinations.slice(0, MAX_INDEED_COMBINATIONS);

  for (const combo of boundedCombinations) {
    try {
      const rows = await fetchIndeedQueryJobs(combo.query, combo.location);
      normalized.push(...rows);
    } catch (error) {
      if (error instanceof HttpStatusError && isBlockedStatus(error.status)) {
        console.warn(
          `[GeneralistIndeedRSSAPI] Stopping after ${error.status} bot-protection block on "${combo.query}" (${combo.location}).`,
        );
        break;
      }

      console.warn(
        `[GeneralistIndeedRSSAPI] Failed query "${combo.query}" (${combo.location}):`,
        String(error),
      );
    }
  }

  const dedup = new Map<string, NormalizedPortalJob>();
  for (const row of normalized) {
    dedup.set(row.sourceUrl, row);
  }

  return normalizeJobsWithCoordinates('GeneralistIndeedRSS', Array.from(dedup.values()));
}
