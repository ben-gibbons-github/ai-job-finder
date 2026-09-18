import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { deriveDescriptionFromContext, extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const ETHICAL_JOBS_URL = 'https://www.ethicaljobs.com.au/jobs';
const MAX_ETHICAL_JOBS_PAGES = 250;

function cleanupWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanCompanyCandidate(value: string, title: string): string {
  let company = cleanupWhitespace(stripHtmlTags(value));
  if (!company) {
    return '';
  }

  // Some snippets include title + company in one run; remove title prefix when present.
  const normalizedTitle = cleanupWhitespace(title);
  if (normalizedTitle && company.toLowerCase().startsWith(`${normalizedTitle.toLowerCase()} `)) {
    company = company.slice(normalizedTitle.length).trim();
  }

  company = company
    .replace(/^featured\s+/i, '')
    .replace(/\bjob location\b.*$/i, '')
    .replace(/\s+(?:&#39;|'|’)?s\s+logo\s*$/i, '')
    .replace(/\s+logo\s*$/i, '')
    .trim();

  // Reject obvious non-company labels and placeholders.
  if (!company || /^(ethical\s*jobs?|unknown)$/i.test(company)) {
    return '';
  }

  return company;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<');
}

function cleanText(value: string): string {
  return cleanupWhitespace(stripHtmlTags(decodeHtmlEntities(value)));
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value;
  }
}

function sourceSlugFromUrl(sourceUrl: string): string {
  const match = sourceUrl.match(/\/members\/([^?#]+)/i);
  return (match?.[1] || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function buildOrganisationLookup(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const pattern = /"slug":"([^"]+)","organisationName":"([^"]+)"/gi;

  for (const match of html.matchAll(pattern)) {
    const slug = decodeJsonString(match[1] || '').trim().toLowerCase();
    const organisation = cleanCompanyCandidate(decodeJsonString(match[2] || ''), '');
    if (!slug || !organisation) {
      continue;
    }
    map.set(slug, organisation);
  }

  return map;
}

function extractCompanyFromCard(cardHtml: string, title: string): string {
  const candidates: string[] = [];
  const afterH2 = cardHtml.match(/<\/h2>\s*<div[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  if (afterH2) {
    candidates.push(afterH2);
  }

  const titleAdjacent = cardHtml.match(/<h2[^>]*>[\s\S]*?<\/h2>\s*<div[^>]*>\s*([^<]{2,220})\s*<\/div>/i)?.[1] || '';
  if (titleAdjacent) {
    candidates.push(titleAdjacent);
  }

  const genericOrg = cardHtml.match(/organisationName\"\s*:\s*\"([^\"]+)\"/i)?.[1] || '';
  if (genericOrg) {
    candidates.push(decodeJsonString(genericOrg));
  }

  for (const candidate of candidates) {
    const cleaned = cleanCompanyCandidate(candidate, title);
    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

function isGenericEthicalJobsTitle(value: string): boolean {
  const normalized = cleanupWhitespace(value).toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/^(ethical\s*jobs?|job\s*search|jobs?)$/.test(normalized)) {
    return true;
  }
  if (/about us|career advice|saved jobs|saved searches/.test(normalized)) {
    return true;
  }
  return false;
}

function extractLocationFromCard(cardHtml: string): string {
  const markerIndex = cardHtml.search(/job_location__title/i);
  if (markerIndex < 0) {
    return 'Unknown';
  }

  const locationSnippet = cardHtml.slice(markerIndex, markerIndex + 900);
  const parts: string[] = [];

  for (const match of locationSnippet.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const raw = match[1] || '';
    const text = cleanText(raw).replace(/^>\s*/, '');
    if (!text || /^job location$/i.test(text)) {
      continue;
    }

    if (parts.length === 0) {
      parts.push(text);
      continue;
    }

    // Second location segment should look like a locality suffix, not a sentence snippet.
    const looksLikeLocalitySuffix = /&gt;|^\s*>/i.test(raw) || /^>/.test(cleanText(raw));
    const notTooLong = text.length <= 60;
    if (looksLikeLocalitySuffix && notTooLong) {
      parts.push(text);
      break;
    }
  }

  if (parts.length === 0) {
    return 'Unknown';
  }

  return parts.join(' > ');
}

function fallbackTitleFromUrl(sourceUrl: string): string {
  const slug = sourceUrl.split('/').filter(Boolean).at(-1) || '';
  if (!slug) {
    return '';
  }
  const fromSlug = slug
    .replace(/[0-9]+$/g, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (isGenericEthicalJobsTitle(fromSlug)) {
    return '';
  }
  return fromSlug;
}

function pageUrl(page: number): string {
  const url = new URL(ETHICAL_JOBS_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseEthicalJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const organisationLookup = buildOrganisationLookup(html);
  const cardPattern =
    /<a[^>]*href="((?:https:\/\/www\.ethicaljobs\.com\.au)?\/members\/[^"\s]+)"[^>]*>([\s\S]{0,7000}?)<\/a>/gi;

  for (const match of html.matchAll(cardPattern)) {
    const rawUrl = (match[1] || '').trim();
    const cardHtml = match[2] || '';
    const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.ethicaljobs.com.au${rawUrl}`;

    const titleMatch = cardHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const extractedTitle = cleanText(titleMatch?.[1] || '');
    const titleCandidate = extractedTitle || fallbackTitleFromUrl(sourceUrl);
    const title = isGenericEthicalJobsTitle(titleCandidate) ? '' : titleCandidate;

    if (!sourceUrl || !title) {
      continue;
    }

    if (/ethical jobs logo|job search|about us|career advice|save\b/i.test(title)) {
      continue;
    }

    const slug = sourceSlugFromUrl(sourceUrl);
    const companyFromLookup = slug ? organisationLookup.get(slug) || '' : '';
    const company = companyFromLookup || extractCompanyFromCard(cardHtml, title);
    const location = extractLocationFromCard(cardHtml);
    const description = deriveDescriptionFromContext(cardHtml, title);

    jobs.push({
      title,
      company: company || 'Ethical Jobs',
      location,
      remote: /remote|work from home/i.test(cleanText(cardHtml)) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description,
      tags: ['EthicalJobs', 'For Purpose'],
    });
  }

  return jobs;
}

async function hydrateEthicalJobsDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
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

export async function fetchAllEthicalJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'EthicalJobs',
      maxPages: MAX_ETHICAL_JOBS_PAGES,
      pageUrl,
      parseJobs: (html) => parseEthicalJobs(html),
      hasNextPage: (html) => /\bnext\b/i.test(html),
    });

    const hydrated = await hydrateEthicalJobsDescriptions(normalized);
    return normalizeJobsWithCoordinates('EthicalJobs', hydrated);
  } catch (error) {
    console.warn('[EthicalJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
