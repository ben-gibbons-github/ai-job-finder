import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';

const TEACHERJOBS_BASE_URL = 'https://www.teacherjobs.com/searchjobs';
const MAX_TEACHERJOBS_PAGES = 80;

function pageUrl(page: number): string {
  const url = new URL(TEACHERJOBS_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseTeacherJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="((?:https?:\/\/www\.teacherjobs\.com)?\/job(?:s)?\/[^"'\s?#]+(?:\?[^"']*)?)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const title = stripHtmlTags(match[2] || '').replace(/\s+/g, ' ').trim();

    if (!rawUrl || !title || /search|category|location|job alert|teacher jobs|school jobs/i.test(title)) {
      continue;
    }

    const sourceUrl = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : new URL(rawUrl, 'https://www.teacherjobs.com').toString();

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 300), from + 1800);
    const companyMatch = context.match(/(?:School|District|Organization|Employer|Company)[^<]{0,100}>([^<]{2,120})/i)
      ?? context.match(/(?:by|at)\s+([A-Z][A-Za-z0-9&.,'() -]{2,90})\s*(?:<|\|)/i);
    const locationMatch = context.match(/(?:Location|City|State|Region)[^<]{0,100}>([^<]{2,120})/i)
      ?? context.match(/\b([A-Za-z .'-]+,\s*[A-Z]{2})\b/i)
      ?? context.match(/\b([A-Za-z .'-]+,\s*[A-Za-z .'-]+(?:,\s*[A-Z]{2})?)\b/i);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'TeacherJobs Employer').trim(),
      location: (locationMatch?.[1] || 'Unknown').trim(),
      remote: /remote|hybrid|virtual|online/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: undefined,
      description: stripHtmlTags(context).slice(0, 600).trim(),
      tags: ['TeacherJobs', 'Education', 'Humanities', 'PublicService'],
    });
  }

  return jobs;
}

export async function fetchAllTeacherJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'TeacherJobs',
      maxPages: MAX_TEACHERJOBS_PAGES,
      pageUrl,
      parseJobs: (html) => parseTeacherJobs(html),
      hasNextPage: (html) => /page=\d+|next|next page|page\s*=\s*\d+/i.test(html),
    });

    return normalizeJobsWithCoordinates('TeacherJobs', normalized);
  } catch (error) {
    console.warn('[TeacherJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
