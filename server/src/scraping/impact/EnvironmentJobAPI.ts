import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const ENVIRONMENTJOB_URL = 'https://environmentjob.co.uk/';
const MAX_ENVIRONMENTJOB_PAGES = 250;

function pageUrl(page: number): string {
  const url = new URL(ENVIRONMENTJOB_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseEnvironmentJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="((?:https:\/\/environmentjob\.co\.uk)?\/jobs\/[0-9]+-[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://environmentjob.co.uk${rawUrl}`;
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    if (/latest jobs|show all|browse jobs|create alert/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(from, from + 800);
    const locationMatch = context.match(/\s([A-Za-z .'-]+(?:,\s*[A-Za-z .'-]+)?)\s+£/i);

    jobs.push({
      title,
      company: 'EnvironmentJob',
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /work from home|home-based|remote/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['EnvironmentJob', 'Climate', 'Environment'],
    });
  }

  return jobs;
}

async function hydrateEnvironmentJobDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
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

export async function fetchAllEnvironmentJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'EnvironmentJob',
      maxPages: MAX_ENVIRONMENTJOB_PAGES,
      pageUrl,
      parseJobs: (html) => parseEnvironmentJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`[?&]page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) || /next page/i.test(html),
    });

    const hydrated = await hydrateEnvironmentJobDescriptions(normalized);
    return normalizeJobsWithCoordinates('EnvironmentJob', hydrated);
  } catch (error) {
    console.warn('[EnvironmentJobAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
