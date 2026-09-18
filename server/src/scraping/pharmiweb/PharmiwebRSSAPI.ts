import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const PHARMIWEB_RSS_URL = 'https://www.pharmiweb.jobs/jobsrss/';

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value: string): string {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parsePharmiwebRss(xml: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    const item = match[1] || '';
    const title = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const sourceUrl = stripHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const posted = stripHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

    if (!title || !sourceUrl) {
      continue;
    }

    jobs.push({
      title,
      company: 'Pharmiweb Employer',
      location: 'Unknown',
      remote: /\bremote\b|\bhybrid\b/i.test(`${title} ${description}`) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted,
      description,
      tags: ['Pharma', 'Biotech', 'Medical', 'Life Sciences'],
    });
  }

  return jobs;
}

export async function fetchAllPharmiwebRssJobs(): Promise<ScrapedJob[]> {
  try {
    const response = await scraperFetch(PHARMIWEB_RSS_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'application/rss+xml,application/xml,text/xml',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const normalized = parsePharmiwebRss(xml);

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('PharmiwebRSS', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[PharmiwebRSSAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
