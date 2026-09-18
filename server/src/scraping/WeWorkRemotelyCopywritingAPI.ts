import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs } from './PaginatedHtmlScrapeUtils.js';

const WWR_COPYWRITING_BASE_URL = 'https://weworkremotely.com/categories/remote-copywriting-jobs';
const MAX_WWR_COPYWRITING_PAGES = 400;

function pageUrl(page: number): string {
  const url = new URL(WWR_COPYWRITING_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseWeWorkRemotelyCopywritingJobs(html: string): NormalizedPortalJob[] {
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
      tags: ['WeWorkRemotely', 'Copywriting', 'Content', 'Remote'],
    });
  }

  return jobs;
}

export async function fetchAllWeWorkRemotelyCopywritingJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'WeWorkRemotelyCopywriting',
      maxPages: MAX_WWR_COPYWRITING_PAGES,
      pageUrl,
      parseJobs: (html) => parseWeWorkRemotelyCopywritingJobs(html),
    });

    return normalizeJobsWithCoordinates('WeWorkRemotelyCopywriting', normalized);
  } catch (error) {
    console.warn('[WeWorkRemotelyCopywritingAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
