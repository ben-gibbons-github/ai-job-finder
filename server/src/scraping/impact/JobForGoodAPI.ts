import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml, sanitizeJobDescription } from '../core/ScrapeDescriptionUtils.js';

const IDEALIST_JOBS_URL = 'https://www.idealist.org/en/jobs';
const MAX_IDEALIST_PAGES = 250;

function pageUrl(page: number): string {
  const url = new URL(IDEALIST_JOBS_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseIdealistJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="((?:https:\/\/www\.idealist\.org)?\/en\/(?:nonprofit-job|business-job|job)\/[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.idealist.org${rawUrl}`;
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    if (/post a job|take salary survey|salary explorer|next page|previous page/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(from, from + 500);
    const locationMatch = context.match(/(?:On-site|Hybrid|Remote)\s+([^<\n\r]{2,80})/i);
    const location = locationMatch?.[1]?.trim() || 'Unknown';

    jobs.push({
      title,
      company: 'Idealist',
      location,
      remote: /remote/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['JobForGood', 'Social Impact', 'Idealist'],
    });
  }

  return jobs;
}

async function hydrateIdealistDescriptionsForJobs(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
  const hydrated: NormalizedPortalJob[] = [];

  for (const job of jobs) {
    let description = sanitizeJobDescription(job.description ?? '');
    if (!description) {
      const detailHtml = await fetchHtml(job.sourceUrl);
      if (detailHtml) {
        description = extractDescriptionFromHtml(detailHtml, job.title, 2000);
      }
    }

    hydrated.push({
      ...job,
      description,
    });
  }

  return hydrated;
}

export async function fetchAllJobForGoodJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'JobForGood',
      maxPages: MAX_IDEALIST_PAGES,
      pageUrl,
      parseJobs: (html) => parseIdealistJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`/en/jobs\\?page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) || /next page/i.test(html),
    });

    const hydrated = await hydrateIdealistDescriptionsForJobs(normalized);
    return normalizeJobsWithCoordinates('JobForGood', hydrated);
  } catch (error) {
    console.warn('[JobForGoodAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
