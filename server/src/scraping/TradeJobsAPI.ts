import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';

const TRADE_JOBS_RSS_URLS = [
  'https://www.indeed.com/rss?q=construction+worker&l=United+States',
  'https://www.indeed.com/rss?q=electrician&l=United+States',
  'https://www.indeed.com/rss?q=plumber&l=United+States',
  'https://www.indeed.com/rss?q=mechanic&l=United+States',
];

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
    return { role: parts[0], company: parts[1] };
  }
  return { role: title, company: 'Trade Employer' };
}

function parseTradeJobsFromRss(xml: string): NormalizedPortalJob[] {
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

    const { role, company } = splitTitleParts(rawTitle);
    const isRemote = /remote|work from home|wfh/i.test(`${rawTitle} ${description}`);

    jobs.push({
      title: role,
      company,
      location: isRemote ? 'Remote' : 'Unknown',
      remote: isRemote ? 'Remote' : 'Unknown',
      type: 'Full-time',
      sourceUrl,
      posted: posted || undefined,
      description,
      tags: ['TradeJobs', 'SkilledTrades', 'Construction', 'Electrical'],
    });
  }

  return jobs;
}

export async function fetchAllTradeJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];

    for (const url of TRADE_JOBS_RSS_URLS) {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: 'application/rss+xml,application/xml,text/xml',
          'User-Agent': 'job-finder-super-scraper/1.0',
        },
      });

      if (!response.ok) {
        continue;
      }

      const xml = await response.text();
      const rows = parseTradeJobsFromRss(xml);
      normalized.push(...rows);
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('TradeJobs', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[TradeJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
