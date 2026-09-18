import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { fetchHtml } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const JOBICY_RSS_URL = 'https://jobicy.com/?feed=job_feed';

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

function firstCleanTag(item: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const value = stripHtml(item.match(pattern)?.[1] || '');
    if (value) {
      return value;
    }
  }

  return '';
}

function companyFromTitle(title: string): string {
  const separatorMatch = title.match(/\s[\-–—|]\s([^|]{2,120})$/);
  if (separatorMatch?.[1]) {
    return separatorMatch[1].trim();
  }

  const atMatch = title.match(/\bat\s+([A-Z][A-Za-z0-9&.,'()\-\/ ]{2,140})$/i);
  if (atMatch?.[1]) {
    return atMatch[1].trim();
  }

  return '';
}

function parseJobicyRss(xml: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemPattern)) {
    const item = match[1] || '';
    const title = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const sourceUrl = stripHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = stripHtml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const posted = stripHtml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
    const company =
      firstCleanTag(item, [
        /<job_listing:company><!\[CDATA\[([\s\S]*?)\]\]><\/job_listing:company>/i,
        /<job_listing:company>([\s\S]*?)<\/job_listing:company>/i,
        /<dc:creator><!\[CDATA\[([\s\S]*?)\]\]><\/dc:creator>/i,
        /<dc:creator>([\s\S]*?)<\/dc:creator>/i,
      ]) || companyFromTitle(title);

    if (!title || !sourceUrl) {
      continue;
    }

    jobs.push({
      title,
      company: company || 'Jobicy Employer',
      location: /remote/i.test(title + ' ' + description) ? 'Remote' : 'Unknown',
      remote: /remote/i.test(title + ' ' + description) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: posted || undefined,
      description,
      tags: ['Jobicy', 'Remote', 'RSS'],
    });
  }

  return jobs;
}

export async function fetchAllJobicyRssJobs(): Promise<ScrapedJob[]> {
  try {
    const response = await scraperFetch(JOBICY_RSS_URL, {
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
    const normalized = parseJobicyRss(xml);

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    const hydrated: NormalizedPortalJob[] = [];
    for (const job of Array.from(dedup.values())) {
      let description = job.description?.trim() || '';
      if (!description) {
        const detailHtml = await fetchHtml(job.sourceUrl);
        if (detailHtml) {
          description = extractDescriptionFromHtml(detailHtml, job.title, 2000);
        }
      }
      hydrated.push({ ...job, description });
    }

    return normalizeJobsWithCoordinates('JobicyRSS', hydrated);
  } catch (error) {
    console.warn('[JobicyRSSAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
