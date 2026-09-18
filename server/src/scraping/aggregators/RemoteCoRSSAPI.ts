import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const REMOTE_CO_RSS_URL = 'https://remote.co/remote-jobs/feed/';

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

function parseRemoteCoRss(xml: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    const item = match[1] || '';
    const rawTitle = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const sourceUrl = stripHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const posted = stripHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

    if (!rawTitle || !sourceUrl) {
      continue;
    }

    const titleParts = rawTitle.split('|').map((part) => part.trim()).filter(Boolean);
    const title = titleParts[0] || rawTitle;

    jobs.push({
      title,
      company: 'Remote.co',
      location: 'Remote',
      remote: 'Remote',
      type: 'Unknown',
      sourceUrl,
      posted: posted || undefined,
      description,
      tags: ['Remote.co', 'Remote', 'RSS'],
    });
  }

  return jobs;
}

export async function fetchAllRemoteCoRssJobs(): Promise<ScrapedJob[]> {
  try {
    const response = await scraperFetch(REMOTE_CO_RSS_URL, {
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
    const normalized = parseRemoteCoRss(xml);

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('RemoteCoRSS', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[RemoteCoRSSAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
