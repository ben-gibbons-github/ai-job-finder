import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const ARTS_JOBS_BASE_URL = 'https://www.artsjobs.org.uk/jobs/search';
const MAX_ARTS_JOBS_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(ARTS_JOBS_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseArtsJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="(\/jobs\/search\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const sourceUrl = `https://www.artsjobs.org.uk${match[1]}`;
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    if (/search jobs|find jobs|advanced search|save search/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 350), from + 1800);
    const companyMatch = context.match(/job__organisation-name">\s*([^<]{2,140})\s*</i);
    const locationMatch = context.match(/job__region">\s*([^<]{2,140})\s*</i);
    const bodyMatch = context.match(/<blockquote class="job__body">([\s\S]*?)<\/blockquote>/i);
    const postedMatch = context.match(/<time datetime="([^"]+)"/i);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'Arts Jobs').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /hybrid|remote|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: postedMatch?.[1],
      description: stripHtmlTags(bodyMatch?.[1] || ''),
      tags: ['Arts', 'Creative', 'JobForGood'],
    });
  }

  return jobs;
}

export async function fetchAllArtsJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'ArtsJobs',
      maxPages: MAX_ARTS_JOBS_PAGES,
      pageUrl,
      parseJobs: (html) => parseArtsJobs(html),
    });

    return normalizeJobsWithCoordinates('ArtsJobs', normalized);
  } catch (error) {
    console.warn('[ArtsJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
