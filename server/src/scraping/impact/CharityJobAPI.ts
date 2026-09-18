import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const CHARITYJOB_URL = 'https://www.charityjob.co.uk/jobs';
const MAX_CHARITYJOB_PAGES = 300;

function pageUrl(page: number): string {
  const url = new URL(CHARITYJOB_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function firstCleanMatch(context: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = context.match(pattern);
    const value = stripHtmlTags(match?.[1] || '').replace(/&amp;/gi, '&').trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseOrganisationText(value: string): { company?: string; location?: string; remote?: string } {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) {
    return {};
  }

  const withMode = text.match(/^(.+?),\s*(.+?)\s*\((On-site|Hybrid|Remote)\)$/i);
  if (withMode) {
    const company = withMode[1]?.trim();
    const location = withMode[2]?.trim();
    const remote = /^(Hybrid|Remote)$/i.test(withMode[3] || '') ? 'Remote' : 'Unknown';
    return { company, location, remote };
  }

  const modeOnly = text.match(/^(.+?)\s*\((On-site|Hybrid|Remote)\)$/i);
  if (modeOnly) {
    const company = modeOnly[1]?.trim();
    const remote = /^(Hybrid|Remote)$/i.test(modeOnly[2] || '') ? 'Remote' : 'Unknown';
    return { company, remote };
  }

  const split = text.match(/^(.+?),\s*(.+)$/);
  if (split) {
    return { company: split[1]?.trim(), location: split[2]?.trim() };
  }

  return { company: text };
}

export function parseCharityJobs(html: string): NormalizedPortalJob[] {
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

    if (/jobs\/?\?/.test(sourceUrl) || /apply now|featured|top job|charity job logo/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 260), from + 1400);
    const organisation = firstCleanMatch(context, [
      /<div[^>]+class="[^"]*\borganisation\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<a[^>]+href="\/organisation\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i,
    ]);
    const parsed = parseOrganisationText(organisation || '');
    const location =
      parsed.location ||
      firstCleanMatch(context, [
        /icon-location[^>]*>[\s\S]*?\n\s*([^<\n][^<]{2,180})\s*</i,
        /<a[^>]+class="[^"]*\btext-link\b[^"]*"[^>]*>\s*([^<]{2,180})\s*<\/a>\s*\((?:On-site|Hybrid|Remote)\)/i,
      ]);
    const remote = parsed.remote || (/\bremote\b|\bhybrid\b/i.test(context) ? 'Remote' : 'Unknown');

    jobs.push({
      title,
      company: parsed.company || 'CharityJob',
      location: location || 'Unknown',
      remote,
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['CharityJob', 'Charity'],
    });
  }

  return jobs;
}

async function hydrateCharityJobDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
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

export async function fetchAllCharityJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'CharityJob',
      maxPages: MAX_CHARITYJOB_PAGES,
      pageUrl,
      parseJobs: (html) => parseCharityJobs(html),
      hasNextPage: (html, page) =>
        new RegExp(`\\b${page + 1}\\b`).test(html) || /next|page \d+ of \d+/i.test(html),
    });

    const hydrated = await hydrateCharityJobDescriptions(normalized);
    return normalizeJobsWithCoordinates('CharityJob', hydrated);
  } catch (error) {
    console.warn('[CharityJobAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
