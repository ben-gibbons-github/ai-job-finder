import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const DEVNET_HIGHLIGHTED_URL = 'https://devnetjobs.org/highlighted_jobs.aspx';

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDevNetHighlightedJobs(html: string): NormalizedPortalJob[] {
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
    const context = html.slice(Math.max(0, from - 250), from + 750);
    const companyMatch = context.match(/\n\s*([A-Z][A-Za-z0-9&.,'()\-\/ ]{2,100})\s*\n\s*\n\s*Location:/i);
    const locationMatch = context.match(/Location:\s*([^\n\r]{2,120})/i);
    const applyMatch = context.match(/Apply by:\s*([^\n\r]{4,40})/i);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'DevNetJobs Highlighted').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /remote|home based|regional \/ global/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: applyMatch?.[1]?.trim(),
      description,
      tags: ['DevNetJobs', 'Highlighted'],
    });
  }

  return jobs;
}

export async function fetchAllDevNetJobsHighlighted(): Promise<ScrapedJob[]> {
  try {
    const response = await fetch(DEVNET_HIGHLIGHTED_URL, {
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
    const normalized = parseDevNetHighlightedJobs(html);

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('DevNetJobsHighlighted', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[DevNetJobsHighlightedAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
