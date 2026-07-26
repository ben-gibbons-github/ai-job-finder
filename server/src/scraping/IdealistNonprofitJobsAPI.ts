import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from './PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from './ScrapeDescriptionUtils.js';

const IDEALIST_NONPROFIT_BASE_URL = 'https://www.idealist.org/en/nonprofit-jobs';
const MAX_IDEALIST_NONPROFIT_PAGES = 500;

function pageUrl(page: number): string {
  const url = new URL(IDEALIST_NONPROFIT_BASE_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function titleFromPath(path: string): string {
  const slug = path.split('/').pop() || '';
  const noId = slug.replace(/^[a-f0-9]{24,40}-/i, '');
  return noId
    .split('-')
    .filter(Boolean)
    .slice(0, 12)
    .join(' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseIdealistNonprofitJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern = /<a[^>]+href="(\/en\/nonprofit-job\/[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const path = (match[1] || '').trim();
    const sourceUrl = `https://www.idealist.org${path}`;
    const anchorText = stripHtmlTags(match[2] || '');
    const title = anchorText || titleFromPath(path);

    if (!sourceUrl || !title) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 220), from + 900);
    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: 'Idealist Nonprofit Employer',
      location: 'Unknown',
      remote: /\bremote\b|\bhybrid\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Idealist', 'Nonprofit'],
    });
  }

  return jobs;
}

export async function fetchAllIdealistNonprofitJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'IdealistNonprofitJobs',
      maxPages: MAX_IDEALIST_NONPROFIT_PAGES,
      pageUrl,
      parseJobs: (html) => parseIdealistNonprofitJobs(html),
    });

    return normalizeJobsWithCoordinates('IdealistNonprofitJobs', normalized);
  } catch (error) {
    console.warn('[IdealistNonprofitJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
