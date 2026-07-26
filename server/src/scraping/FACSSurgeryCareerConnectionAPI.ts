import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const FACS_SURGERY_CAREER_BASE_URL = 'https://surgeonjobs.facs.org/jobs/';
const MAX_FACS_SURGERY_CAREER_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(FACS_SURGERY_CAREER_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function titleFromPath(path: string): string {
  const slug = path.split('/').filter(Boolean).slice(-2, -1)[0] || '';
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 18)
    .join(' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseFacsSurgeryJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https:\/\/surgeonjobs\.facs\.org)?\/job\/[^"]+\/\d+\/?(?:\?[^"\s]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://surgeonjobs.facs.org${rawUrl}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    if (/search|alerts|saved|sign in|register/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 350), from + 1600);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: 'FACS Employer',
      location: 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Medical', 'Surgery', 'Healthcare'],
    });
  }

  return jobs;
}

export async function fetchAllFacsSurgeryCareerJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'FACSSurgeryCareerConnection',
      maxPages: MAX_FACS_SURGERY_CAREER_PAGES,
      pageUrl,
      parseJobs: (html) => parseFacsSurgeryJobs(html),
      hasNextPage: (html, page) => {
        const nextPageRegex = new RegExp(`(?:\\?|&)page=${page + 1}(?:["'&]|$)`, 'i');
        return nextPageRegex.test(html);
      },
    });

    return normalizeJobsWithCoordinates('FACSSurgeryCareerConnection', normalized);
  } catch (error) {
    console.warn('[FACSSurgeryCareerConnectionAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
