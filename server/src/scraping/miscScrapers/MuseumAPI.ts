import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const MUSEUM_JOBS_URL = 'https://aam-us-jobs.careerwebsite.com/jobs/';
const MAX_MUSEUM_PAGES = 150;

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMuseumJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const cardPattern =
    /<a[^>]+href="(https:\/\/aam-us-jobs\.careerwebsite\.com\/job\/[^"\s]+\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(cardPattern)) {
    const sourceUrl = (match[1] || '').trim();
    const title = stripHtmlTags(match[2] || '');
    if (!sourceUrl || !title) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(from, from + 500);
    const locationMatch = context.match(/([A-Za-z .'-]+,\s*[A-Za-z .'-]+,\s*United States(?:\((?:Remote|Hybrid|On-Site)\))?)/i);
    const location = locationMatch?.[1]?.trim() || 'Unknown';

    jobs.push({
      title,
      company: 'AAM JobHQ',
      location,
      remote: /remote/i.test(location) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['Museum'],
    });
  }

  return jobs;
}

export async function fetchAllMuseumJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];

    for (let page = 1; page <= MAX_MUSEUM_PAGES; page += 1) {
      const url = page === 1 ? MUSEUM_JOBS_URL : `${MUSEUM_JOBS_URL}?page=${page}`;
      const response = await scraperFetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'job-finder-super-scraper/1.0',
        },
      });

      if (!response.ok) {
        if (page === 1) {
          return [];
        }
        break;
      }

      const html = await response.text();
      const pageJobs = parseMuseumJobs(html);
      if (pageJobs.length === 0) {
        break;
      }

      const before = normalized.length;
      normalized.push(...pageJobs);
      const added = normalized.length - before;
      if (added === 0) {
        break;
      }

      const hasNextPage =
        new RegExp(`[?&]page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) ||
        /next page/i.test(html);
      if (!hasNextPage) {
        break;
      }
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('Museum', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[MuseumAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
