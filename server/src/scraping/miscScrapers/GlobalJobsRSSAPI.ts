import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const GLOBAL_JOBS_RSS_URL = 'https://www.globaljobs.org/jobs/feed.rss';

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtmlTags(value: string): string {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseGlobalJobsRss(xml: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    const item = match[1] || '';
    const title = stripHtmlTags(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const sourceUrl = stripHtmlTags(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = stripHtmlTags(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const posted = stripHtmlTags(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

    if (!title || !sourceUrl) {
      continue;
    }

    const locationMatch = title.match(/\bjob in\s+(.+)$/i);
    const imageAltMatch = item.match(/<img[^>]+alt='([^']{2,180})'/i) || item.match(/<img[^>]+alt="([^"]{2,180})"/i);
    const companyFromImage = stripHtmlTags(imageAltMatch?.[1] || '');
    const companyFromTitle = title.match(/^(.+?)\s+job in\s+/i)?.[1]?.trim() || '';
    const inferredCompany = companyFromImage || companyFromTitle;

    jobs.push({
      title: title.replace(/\s+job in\s+.+$/i, '').trim(),
      company: inferredCompany || 'GlobalJobs RSS',
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /\bremote\b/i.test(title) || /\bremote\b/i.test(description) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted,
      description,
      tags: ['GlobalJobs', 'RSS'],
    });
  }

  return jobs;
}

export async function fetchAllGlobalJobsRss(): Promise<ScrapedJob[]> {
  try {
    const response = await scraperFetch(GLOBAL_JOBS_RSS_URL, {
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
    const normalized = parseGlobalJobsRss(xml);

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('GlobalJobsRSS', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[GlobalJobsRSSAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
