import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs } from '../core/PaginatedHtmlScrapeUtils.js';

const WWR_BUSINESS_MANAGEMENT_BASE_URL = 'https://weworkremotely.com/categories/remote-business-and-management-jobs';
const MAX_WWR_BUSINESS_MANAGEMENT_PAGES = 400;

function pageUrl(page: number): string {
  const url = new URL(WWR_BUSINESS_MANAGEMENT_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseWeWorkRemotelyBusinessManagementJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /href="((?:https:\/\/weworkremotely\.com)?\/remote-jobs\/[^\"]+)"/gi;

  for (const match of html.matchAll(linkPattern)) {
    const raw = (match[1] || '').trim();
    const sourceUrl = raw.startsWith('http') ? raw : `https://weworkremotely.com${raw}`;

    if (
      !sourceUrl ||
      /find-your-plan|listing_ads|\/categories\/|\/company\//i.test(sourceUrl) ||
      /\?|#/.test(sourceUrl)
    ) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 350), from + 1800);

    const titleMatch = context.match(/new-listing__header__title__text">\s*([^<]{2,180})\s*</i);
    const companyMatch = context.match(/new-listing__company-name">\s*([^<\n\r]{2,180})\s*</i);
    const locationMatch = context.match(/new-listing__company-headquarters[^>]*>\s*([^<]{2,180})\s*</i);
    const typeMatch = context.match(/new-listing__categories__category">\s*(Contract|Full-time|Part-time|Freelance)\s*</i);

    const title = titleMatch?.[1]?.trim();
    if (!title) {
      continue;
    }

    jobs.push({
      title,
      company: companyMatch?.[1]?.trim() || 'WeWorkRemotely Employer',
      location: locationMatch?.[1]?.trim() || 'Remote',
      remote: 'Remote',
      type: typeMatch?.[1] || 'Unknown',
      sourceUrl,
      description: '',
      tags: ['WeWorkRemotely', 'Business', 'Management', 'Remote'],
    });
  }

  return jobs;
}

export async function fetchAllWeWorkRemotelyBusinessManagementJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'WeWorkRemotelyBusinessManagement',
      maxPages: MAX_WWR_BUSINESS_MANAGEMENT_PAGES,
      pageUrl,
      parseJobs: (html) => parseWeWorkRemotelyBusinessManagementJobs(html),
    });

    return normalizeJobsWithCoordinates('WeWorkRemotelyBusinessManagement', normalized);
  } catch (error) {
    console.warn('[WeWorkRemotelyBusinessManagementAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
