import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const DEVNET_HOME_URL = 'https://devnetjobs.org/';

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanCompany(value: string): string | undefined {
  const company = stripHtmlTags(value || '').trim();
  if (!company || /^\(Value Members only\)$/i.test(company)) {
    return undefined;
  }
  return company;
}

function parseDevNetHomeJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="((?:https:\/\/devnetjobs\.org)?\/jobdescription\.aspx\?job_id=\d+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://devnetjobs.org${rawUrl}`;
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 260), from + 1200);
    const companyMatch = context.match(/id="[^"]*lblJobCo"[^>]*>([\s\S]*?)<\/span>/i);
    const fallbackCompanyMatch = context.match(/\n\s*([A-Z][A-Za-z0-9&.,'()\-\/ ]{2,140})\s*\n\s*\n\s*Location:/i);
    const locationMatch = context.match(/Location:\s*([^\n\r]{2,120})/i);

    jobs.push({
      title,
      company: cleanCompany(companyMatch?.[1] || '') || cleanCompany(fallbackCompanyMatch?.[1] || '') || 'DevNetJobs',
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /remote|home based|regional \/ global/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['DevNetJobs', 'Homepage'],
    });
  }

  return jobs;
}

export async function fetchAllDevNetJobsHome(): Promise<ScrapedJob[]> {
  try {
    const response = await scraperFetch(DEVNET_HOME_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const normalized = parseDevNetHomeJobs(html);

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('DevNetJobsHome', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[DevNetJobsHomeAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
