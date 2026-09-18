import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchPortalJobsFromEndpointList } from '../core/GenericEndpointPortalAPI.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { deriveDescriptionFromContext, sanitizeJobDescription } from '../core/ScrapeDescriptionUtils.js';
import { recordPageJobCount } from '../core/ScrapeDebugTelemetry.js';
import { fetchPortalFallbackJobs } from '../ats/TerraBoardFallback.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const BUILTIN_JOBS_URL = 'https://www.builtin.com/jobs';
const MAX_BUILTIN_PAGES = 50;
const BUILTIN_BASE_URL = 'https://builtin.com';

function normalizeBuiltInHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^https?:\/\/www\.builtin\.com/i, BUILTIN_BASE_URL);
  }

  return `${BUILTIN_BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function extractBuiltInDescriptionFromRawHtml(rawHtml: unknown, title = ''): string {
  const cleaned = sanitizeJobDescription(rawHtml);
  if (cleaned.length >= 80) {
    return cleaned;
  }

  const fromContext = deriveDescriptionFromContext(String(rawHtml ?? ''), title, 1200);
  if (fromContext.length >= 80) {
    return fromContext;
  }

  return cleaned;
}

function pickBetterDescription(first: string, second: string): string {
  const a = String(first ?? '').trim();
  const b = String(second ?? '').trim();

  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  return b.length > a.length ? b : a;
}

function extractBuiltInCompanyName(obj: Record<string, unknown>, fallback = 'BuiltIn'): string {
  const directCompany =
    typeof obj.company === 'string'
      ? obj.company
      : typeof obj.companyName === 'string'
        ? obj.companyName
        : typeof obj.company_name === 'string'
          ? obj.company_name
          : '';
  if (directCompany.trim()) {
    return directCompany.trim();
  }

  const org = obj.hiringOrganization ?? obj.organization;
  if (typeof org === 'string' && org.trim()) {
    return org.trim();
  }

  if (org && typeof org === 'object') {
    const orgObj = org as Record<string, unknown>;
    const orgName =
      typeof orgObj.name === 'string'
        ? orgObj.name
        : typeof orgObj.legalName === 'string'
          ? orgObj.legalName
          : typeof orgObj.alternateName === 'string'
            ? orgObj.alternateName
            : '';
    if (orgName.trim()) {
      return orgName.trim();
    }
  }

  return fallback;
}

function isGenericBuiltInCompany(company: string): boolean {
  return /^BuiltIn(?:\b|\s)/i.test(company.trim());
}

export function collectBuiltInCardRowsFromHtml(html: string): NormalizedPortalJob[] {
  const rows: NormalizedPortalJob[] = [];
  const jobAnchorPattern = /<a[^>]*data-id="job-card-title"[^>]*data-alias="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const companyAnchorPattern = /<a[^>]*data-id="company-title"[^>]*>\s*<span>([^<]+)<\/span>\s*<\/a>/gi;
  const PAIRING_WINDOW_CHARS = 2_000;

  for (const match of html.matchAll(jobAnchorPattern)) {
    const alias = (match[1] || '').trim();
    const title = (match[2] || '').trim();
    const absoluteIndex = match.index ?? -1;
    if (!alias || absoluteIndex < 0) {
      continue;
    }

    const windowStart = Math.max(0, absoluteIndex - PAIRING_WINDOW_CHARS);
    const windowEnd = Math.min(html.length, absoluteIndex + PAIRING_WINDOW_CHARS);
    const windowText = html.slice(windowStart, windowEnd);
    const localJobIndex = absoluteIndex - windowStart;
    const preceding = windowText.slice(0, localJobIndex);
    const lastJobAnchorBefore = preceding.lastIndexOf('data-id="job-card-title"');
    const cardDescription = extractBuiltInDescriptionFromRawHtml(windowText, title);

    let company = '';
    for (const companyMatch of preceding.matchAll(companyAnchorPattern)) {
      const candidate = (companyMatch[1] || '').trim();
      const candidateIndex = companyMatch.index ?? -1;
      if (!candidate || candidateIndex <= lastJobAnchorBefore) {
        continue;
      }
      company = candidate;
    }

    if (!company) {
      continue;
    }

    const sourceUrl = normalizeBuiltInHref(alias);
    rows.push({
      title: title || 'BuiltIn Job',
      company,
      location: 'Remote',
      remote: 'Unknown',
      type: 'Full-time',
      sourceUrl,
      description: cardDescription,
      tags: ['BuiltIn'],
    });
  }

  return rows;
}

function collectBuiltInEntries(value: unknown): NormalizedPortalJob[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectBuiltInEntries(item));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const obj = value as Record<string, unknown>;
  const entries: NormalizedPortalJob[] = [];
  const rawUrl =
    typeof obj.url === 'string'
      ? obj.url
      : typeof obj.jobUrl === 'string'
        ? obj.jobUrl
        : typeof obj.canonicalUrl === 'string'
          ? obj.canonicalUrl
          : '';
  const url = normalizeBuiltInHref(rawUrl);
  const title =
    typeof obj.name === 'string'
      ? obj.name
      : typeof obj.title === 'string'
        ? obj.title
        : '';
  const description = extractBuiltInDescriptionFromRawHtml(
    obj.description ?? obj.jobDescription ?? obj.summary ?? '',
    title,
  );

  if (url.includes('builtin.com') && title) {
    entries.push({
      title: title.trim(),
      company: extractBuiltInCompanyName(obj, 'BuiltIn'),
      location: 'Remote',
      remote: 'Unknown',
      type: 'Full-time',
      sourceUrl: url,
      description,
      tags: ['BuiltIn'],
    });
  }

  for (const nested of Object.values(obj)) {
    entries.push(...collectBuiltInEntries(nested));
  }

  return entries;
}

async function fetchBuiltInPageJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];

    for (let page = 1; page <= MAX_BUILTIN_PAGES; page += 1) {
      const url = page === 1 ? BUILTIN_JOBS_URL : `${BUILTIN_JOBS_URL}?page=${page}`;
      const response = await scraperFetch(url, {
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
      const pageRows: NormalizedPortalJob[] = [];

      const scriptPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
      for (const scriptMatch of html.matchAll(scriptPattern)) {
        const scriptText = scriptMatch[1] || '';
        try {
          const parsed = JSON.parse(scriptText) as unknown;
          pageRows.push(...collectBuiltInEntries(parsed));
        } catch {
          // Ignore malformed JSON-LD blocks and continue with the HTML fallbacks.
        }
      }

      pageRows.push(...collectBuiltInCardRowsFromHtml(html));

      const fallbackRows = await fetchPortalFallbackJobs('BuiltIn', (url) => /builtin\.com/i.test(url));
      pageRows.push(...fallbackRows.map((row) => ({
        title: row.name,
        company: row.company_name,
        location: row.location,
        remote: row.remote,
        type: row.type,
        sourceUrl: row.source_url,
        description: row.description || '',
        tags: row.tags || ['BuiltIn'],
      })));

      recordPageJobCount({
        sourceName: 'BuiltIn',
        query: url,
        page,
        jobsFound: pageRows.length,
        sourceUrls: pageRows.map((row) => row.sourceUrl),
      });

      if (pageRows.length === 0) {
        break;
      }

      normalized.push(...pageRows);
    }

    return normalizeJobsWithCoordinates('BuiltIn', normalized);
  } catch (error) {
    console.warn('[BuiltInAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}

export async function fetchAllBuiltInJobs(): Promise<ScrapedJob[]> {
  return fetchBuiltInPageJobs();
}