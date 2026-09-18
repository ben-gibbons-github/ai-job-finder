import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const GLOBALJOBS_URL = 'https://www.globaljobs.org/jobs/';
const MAX_GLOBALJOBS_PAGES = 300;

function cleanText(value: string): string {
  return stripHtmlTags(value).replace(/\s+/g, ' ').trim();
}

function cleanCompany(value: string): string {
  const company = cleanText(value);
  if (!company || /^global\s*jobs?$/i.test(company)) {
    return '';
  }
  return company;
}

function pageUrl(page: number): string {
  const url = new URL(GLOBALJOBS_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseGlobalJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="((?:https:\/\/www\.globaljobs\.org)?\/jobs\/[0-9]+-[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.globaljobs.org${rawUrl}`;
    const title = cleanText(match[2] || '');
    if (!sourceUrl || !title) {
      continue;
    }

    if (/global jobs|post a job|login|register|rss feed/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 450), from + 1400);
    const companyMatch = context.match(/<div[^>]+class="[^"]*\batlas-job-org\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const company = cleanCompany(companyMatch?.[1] || '');

    const locationBlock = context.match(/<div[^>]+class="[^"]*\batlas-job-location\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const locationFromBlock = cleanText(locationBlock?.[1] || '').replace(/^(remote|hybrid|onsite)$/i, '').trim();
    const locationMatch = context.match(/\bjob in\s+([^<\n\r]{2,160})/i) || context.match(/([A-Za-z .'-]+,\s*[A-Za-z .'-]+)/i);
    const location = locationFromBlock || locationMatch?.[1]?.trim() || 'Unknown';

    jobs.push({
      title,
      company: company || 'GlobalJobs',
      location,
      remote: /remote/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['GlobalJobs', 'Global Affairs'],
    });
  }

  return jobs;
}

async function hydrateGlobalJobsDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
  const hydrated: NormalizedPortalJob[] = [];

  for (const job of jobs) {
    let description = job.description?.trim() || '';
    if (!description) {
      const detailHtml = await fetchHtml(job.sourceUrl);
      if (detailHtml) {
        description = extractDescriptionFromHtml(detailHtml, job.title, 2000);
      }
    }

    hydrated.push({ ...job, description });
  }

  return hydrated;
}

export async function fetchAllGlobalJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'GlobalJobs',
      maxPages: MAX_GLOBALJOBS_PAGES,
      pageUrl,
      parseJobs: (html) => parseGlobalJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`[?&]page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) || /next page/i.test(html),
    });

    const hydrated = await hydrateGlobalJobsDescriptions(normalized);
    return normalizeJobsWithCoordinates('GlobalJobs', hydrated);
  } catch (error) {
    console.warn('[GlobalJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
