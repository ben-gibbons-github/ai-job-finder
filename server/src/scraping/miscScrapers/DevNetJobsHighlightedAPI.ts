import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { deriveDescriptionFromContext } from '../core/ScrapeDescriptionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const DEVNET_HIGHLIGHTED_URL = 'https://devnetjobs.org/highlighted_jobs.aspx';

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

function parseDevNetHighlightedJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const rowPattern = /<div[^>]+id="ctl00_ContentPlaceHolder1_grdJobs_ctl\d+_upJob"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const rowHtml = rowMatch[1] || '';
    const linkMatch = rowHtml.match(/<a[^>]+href="((?:https:\/\/devnetjobs\.org)?\/jobdescription\.aspx\?job_id=\d+)"[^>]*>([\s\S]*?)<\/a>/i);
    const rawUrl = (linkMatch?.[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://devnetjobs.org${rawUrl}`;

    const titleMatch = rowHtml.match(/id="[^"]*lblJobTitle"[^>]*>([\s\S]*?)<\/span>/i);
    const title = stripHtmlTags(titleMatch?.[1] || stripHtmlTags(linkMatch?.[2] || ''));

    if (!sourceUrl || !title) {
      continue;
    }

    const companyMatch = rowHtml.match(/id="[^"]*lblJobCo"[^>]*>([\s\S]*?)<\/span>/i);
    const fallbackCompanyMatch = rowHtml.match(/\n\s*([A-Z][A-Za-z0-9&.,'()\-\/ ]{2,140})\s*\n\s*\n\s*Location:/i);
    const locationMatch = rowHtml.match(/Location:\s*([^\n\r<]{2,160})/i);
    const applyMatch = rowHtml.match(/Apply by:\s*([^\n\r<]{4,40})/i);
    const description = deriveDescriptionFromContext(rowHtml, title);

    jobs.push({
      title,
      company:
        cleanCompany(companyMatch?.[1] || '') || cleanCompany(fallbackCompanyMatch?.[1] || '') || 'DevNetJobs Highlighted',
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /remote|home based|regional \/ global/i.test(rowHtml) ? 'Remote' : 'Unknown',
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
    const response = await scraperFetch(DEVNET_HIGHLIGHTED_URL, {
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
