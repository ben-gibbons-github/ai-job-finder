import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext } from '../core/ScrapeDescriptionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

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

function inferCompanyFromText(context: string): string | undefined {
  const lineNearTitle = firstCleanMatch(context, [
    /<p[^>]*class=['"]job-description['"][^>]*>\s*([^<]{2,180})/i,
  ]);

  if (!lineNearTitle) {
    return undefined;
  }

  const companyLike = lineNearTitle.match(/^(?:at\s+)?([A-Z][A-Za-z0-9&.,'()\-\/ ]{2,120})\s*[|\-–—]/);
  if (companyLike?.[1]) {
    return companyLike[1].trim();
  }

  return undefined;
}

async function fetchCompanyFromDetail(sourceUrl: string): Promise<string | undefined> {
  try {
    const response = await scraperFetch(sourceUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    return firstCleanMatch(html, [
      /itemprop=['"]hiringOrganization['"][\s\S]*?itemprop=['"]name['"][^>]*>([\s\S]*?)<\//i,
      /(?:company|employer|organisation|organization)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*<\/span>/i,
      /(?:company|employer|organisation|organization)[^>]*>\s*([^<]{2,180})\s*</i,
      /<meta[^>]+property=['"]og:site_name['"][^>]+content=['"]([^'"]{2,180})['"]/i,
    ]);
  } catch {
    return undefined;
  }
}

function parseBioTalentJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const rowPattern = /<li\s+class='job-result-item'[\s\S]*?<\/li>/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const rowHtml = rowMatch[0] || '';
    const jobLinkMatch = rowHtml.match(/<div\s+class='job-title'>\s*<a\s+href="((?:https:\/\/www\.biotalent\.com)?\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const rawUrl = (jobLinkMatch?.[1] || '').trim();
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.biotalent.com${rawUrl}`;
    const anchorText = stripHtmlTags(jobLinkMatch?.[2] || '');
    const title = anchorText || titleFromPath(rawUrl);

    if (!sourceUrl || !title) {
      continue;
    }

    const context = rowHtml;

    const companyFromRow =
      firstCleanMatch(context, [
        /<li[^>]*class=['"]results-job-company['"][^>]*>([\s\S]*?)<\/li>/i,
        /(?:company|employer|organisation|organization)\s*<\/span>\s*<span[^>]*>\s*([^<]{2,180})\s*<\/span>/i,
      ]) || inferCompanyFromText(context);

    const location =
      firstCleanMatch(context, [
        /<li[^>]*class=['"]results-job-location['"][^>]*>([\s\S]*?)<\/li>/i,
        /\b([A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+)\b/i,
      ]) || 'Unknown';

    const description = deriveDescriptionFromContext(context, title);

    jobs.push({
      title,
      company: companyFromRow || 'BioTalent Employer',
      location,
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['Biotech', 'Medical', 'Engineering'],
    });
  }

  return jobs;
}

async function enrichBioTalentCompanies(rows: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (row.company && row.company !== 'BioTalent Employer') {
        return row;
      }

      const detailCompany = await fetchCompanyFromDetail(row.sourceUrl);
      if (!detailCompany) {
        return row;
      }

      return {
        ...row,
        company: detailCompany,
      };
    }),
  );
}

export async function fetchAllBioTalentJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];

    for (let page = 1; page <= MAX_BIOTALENT_JOBS_PAGES; page += 1) {
      const response = await scraperFetch(pageUrl(page), {
        method: 'GET',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'job-finder-super-scraper/1.0',
        },
      });

      if (!response.ok) {
        if (page === 1) {
          return [];
        }
        break;
      }

      const html = await response.text();
      const pageRows = parseBioTalentJobs(html);
      if (pageRows.length === 0) {
        break;
      }

      normalized.push(...pageRows);

      const hasNextPage =
        new RegExp(`(?:\\?|&)page=${page + 1}(?:["'&]|$)`, 'i').test(html) ||
        /next page|rel=['"]next['"]/i.test(html);
      if (!hasNextPage) {
        break;
      }
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    const enriched = await enrichBioTalentCompanies(Array.from(dedup.values()));

    return normalizeJobsWithCoordinates('BioTalentJobs', enriched);
  } catch (error) {
    console.warn('[BioTalentJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
