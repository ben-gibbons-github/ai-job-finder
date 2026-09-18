import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext, extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const CHARITY_VILLAGE_BASE_URL = 'https://www.charityvillage.com/jobs';
const MAX_CHARITY_VILLAGE_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(CHARITY_VILLAGE_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseCharityVillageJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="(\/job\/[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const sourceUrl = `https://www.charityvillage.com${match[1]}`;
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 250), from + 1200);
    const companyMatch = context.match(/jobTeaser_companyName[^>]*>([^<]{2,120})</i);
    const locationMatch = context.match(/jobTeaserLocation[^>]*>([^<]{2,120})</i);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'CharityVillage').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /\bremote\b|\bhybrid\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['CharityVillage', 'Nonprofit'],
    });
  }

  return jobs;
}

async function hydrateCharityVillageDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
  const hydrated: NormalizedPortalJob[] = [];

  for (const job of jobs) {
    let description = job.description?.trim() || '';
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

export async function fetchAllCharityVillageJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'CharityVillage',
      maxPages: MAX_CHARITY_VILLAGE_PAGES,
      pageUrl,
      parseJobs: (html) => parseCharityVillageJobs(html),
      hasNextPage: (html, page) => new RegExp(`/jobs\\?page=${page + 1}(?:["&]|$)`, 'i').test(html),
    });

    const hydrated = await hydrateCharityVillageDescriptions(normalized);
    return normalizeJobsWithCoordinates('CharityVillage', hydrated);
  } catch (error) {
    console.warn('[CharityVillageAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
