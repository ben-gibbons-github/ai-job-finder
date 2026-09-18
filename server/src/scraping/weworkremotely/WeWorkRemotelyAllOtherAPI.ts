import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs } from '../core/PaginatedHtmlScrapeUtils.js';

const WWR_ALL_OTHER_BASE_URL = 'https://weworkremotely.com/categories/remote-all-other-remote-jobs';
const MAX_WWR_ALL_OTHER_PAGES = 400;

function pageUrl(page: number): string {
  const url = new URL(WWR_ALL_OTHER_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseWeWorkRemotelyAllOtherJobs(html: string): NormalizedPortalJob[] {
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
      tags: ['WeWorkRemotely', 'AllOther', 'Remote'],
    });
  }

  return jobs;
}

export async function fetchAllWeWorkRemotelyAllOtherJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'WeWorkRemotelyAllOther',
      maxPages: MAX_WWR_ALL_OTHER_PAGES,
      pageUrl,
      parseJobs: (html) => parseWeWorkRemotelyAllOtherJobs(html),
    });

    return normalizeJobsWithCoordinates('WeWorkRemotelyAllOther', normalized);
  } catch (error) {
    console.warn('[WeWorkRemotelyAllOtherAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
