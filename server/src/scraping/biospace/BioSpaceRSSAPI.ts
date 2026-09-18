import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const BIOSPACE_JOBS_URL = 'https://jobs.biospace.com/jobs/';
const MAX_BIOSPACE_PAGES = 500;

function pageUrl(page: number): string {
  return page <= 1 ? BIOSPACE_JOBS_URL : `${BIOSPACE_JOBS_URL}${page}/`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(parseInt(num, 10)));
}

function stripHtml(value: string): string {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseBioSpaceJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<h3[^>]*class="[^"]*lister__header[^"]*"[^>]*>\s*<a[\s\S]*?href="\s*((?:https:\/\/jobs\.biospace\.com)?\/job\/\d+\/[^"?#]+\/?(?:\?[^"\s]*)?)\s*"[\s\S]*?>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const rawUrl = (match[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://jobs.biospace.com${rawUrl}`;
    const title = stripHtml(match[2] || '');

    if (!title || !sourceUrl || !sourceUrl.includes('/job/')) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 400), from + 1600);
    const companyAltMatch = context.match(/lister__meta-item--recruiter[^>]*>[\s\S]*?<img[^>]+alt="([^"]+)"/i);
    const companySpanMatch = context.match(/lister__meta-item--recruiter[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const locationMatch = context.match(/lister__meta-item--location[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const dateMatch = context.match(/title="Added in the last\s+([^">]+)"/i);
    const descriptionMatch = context.match(/lister__detail[^>]*>([\s\S]*?)<\/div>/i);

    jobs.push({
      title,
      company: stripHtml(companyAltMatch?.[1] || companySpanMatch?.[1] || 'BioSpace Employer'),
      location: stripHtml(locationMatch?.[1] || 'Unknown'),
      remote: /\bremote\b|\bhybrid\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      posted: stripHtml(dateMatch?.[1] || ''),
      description: stripHtml(descriptionMatch?.[1] || ''),
      tags: ['Biotech', 'Medical', 'Life Sciences'],
    });
  }

  return jobs;
}

export async function fetchAllBioSpaceRssJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'BioSpaceRSS',
      maxPages: MAX_BIOSPACE_PAGES,
      pageUrl,
      parseJobs: (html) => parseBioSpaceJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`/jobs/${page + 1}/(?:["?#]|$)`, 'i').test(html) || /rel="next"/i.test(html),
    });

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('BioSpaceRSS', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[BioSpaceRSSAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
