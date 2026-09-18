import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const CHARITYJOB_CREATIVE_URL = 'https://www.charityjob.co.uk/marketing-communication-jobs';
const MAX_CHARITYJOB_CREATIVE_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(CHARITYJOB_CREATIVE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseCharityCreativeJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="((?:https:\/\/www\.charityjob\.co\.uk)?\/jobs\/[^"?#]+\/[0-9]+(?:\?[^\"]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.charityjob.co.uk${rawUrl}`;
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    if (/jobs\/?\?|apply now|featured|top job|charity job logo/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(from, from + 900);
    const companyMatch = context.match(/<a[^>]+href="javascript:void\(0\)"[^>]*>([^<]+)<\/a>/i);
    const locationMatch = context.match(/,\s*([^<\n\r]{2,100})\s*\((?:On-site|Hybrid|Remote)\)/i);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'CharityJob').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /\((?:[^)]*remote[^)]*)\)/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['CharityJob', 'Creative', 'Marketing', 'JobForGood'],
    });
  }

  return jobs;
}

async function hydrateCharityJobCreativeDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
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

export async function fetchAllCharityJobCreativeJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'CharityJobCreative',
      maxPages: MAX_CHARITYJOB_CREATIVE_PAGES,
      pageUrl,
      parseJobs: (html) => parseCharityCreativeJobs(html),
    });

    const hydrated = await hydrateCharityJobCreativeDescriptions(normalized);
    return normalizeJobsWithCoordinates('CharityJobCreative', hydrated);
  } catch (error) {
    console.warn('[CharityJobCreativeAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
