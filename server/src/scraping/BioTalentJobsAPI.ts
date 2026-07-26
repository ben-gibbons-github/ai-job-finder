import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const BIOTALENT_JOBS_BASE_URL = 'https://www.biotalent.com/jobs';
const MAX_BIOTALENT_JOBS_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(BIOTALENT_JOBS_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function titleFromPath(path: string): string {
  const slug = path.split('/').filter(Boolean).pop() || '';
  return slug
    .replace(/-\d+$/, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 18)
    .join(' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseBioTalentJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https:\/\/www\.biotalent\.com)?\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.biotalent.com${rawUrl}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 320), from + 1400);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: 'BioTalent Employer',
      location: 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Biotech', 'Medical', 'Engineering'],
    });
  }

  return jobs;
}

export async function fetchAllBioTalentJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'BioTalentJobs',
      maxPages: MAX_BIOTALENT_JOBS_PAGES,
      pageUrl,
      parseJobs: (html) => parseBioTalentJobs(html),
      hasNextPage: (html, page) => new RegExp(`(?:\\?|&)page=${page + 1}(?:["'&]|$)`, 'i').test(html),
    });

    return normalizeJobsWithCoordinates('BioTalentJobs', normalized);
  } catch (error) {
    console.warn('[BioTalentJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
