import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { fetchHtml } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml, sanitizeJobDescription } from '../core/ScrapeDescriptionUtils.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const BUILTIN_GREENTECH_JOBS_URL = 'https://www.builtin.com/jobs/greentech';
const MAX_BUILTIN_GREENTECH_PAGES = 50;
const BUILTIN_BASE_URL = 'https://builtin.com';
const BUILTIN_COMPANY_ANCHOR_DISTANCE_LIMIT = 1_500;

function extractBuiltInCompanyName(obj: Record<string, unknown>, fallback = 'BuiltIn GreenTech'): string {
  const directCompany =
    typeof obj.company === 'string'
      ? obj.company
      : typeof obj.companyName === 'string'
        ? obj.companyName
        : typeof obj.company_name === 'string'
          ? obj.company_name
          : '';
  if (directCompany.trim()) return directCompany.trim();

  if (obj.company && typeof obj.company === 'object') {
    const companyObj = obj.company as Record<string, unknown>;
    const nestedCompanyName =
      typeof companyObj.name === 'string'
        ? companyObj.name
        : typeof companyObj.legalName === 'string'
          ? companyObj.legalName
          : typeof companyObj.alternateName === 'string'
            ? companyObj.alternateName
            : '';
    if (nestedCompanyName.trim()) return nestedCompanyName.trim();
  }

  const org = obj.hiringOrganization ?? obj.organization;
  if (typeof org === 'string' && org.trim()) return org.trim();
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
    if (orgName.trim()) return orgName.trim();
  }

  return fallback;
}

function isGenericBuiltInCompany(company: string): boolean {
  return /^BuiltIn(?:\b|\s)/i.test(company.trim());
}

interface BuiltInAnchorMatch {
  href: string;
  text: string;
  index: number;
}

function isBuiltInCompanyHref(href: string): boolean {
  return /^(?:https?:\/\/(?:www\.)?builtin\.com)?\/company\//i.test(href.trim());
}

function isBuiltInJobHref(href: string): boolean {
  return /^(?:https?:\/\/(?:www\.)?builtin\.com)?\/job\//i.test(href.trim());
}

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

function normalizeBuiltInAnchorText(rawHtml: string): string {
  return sanitizeJobDescription(rawHtml)
    .replace(/\s+logo$/i, '')
    .trim();
}

function collectBuiltInAnchors(html: string, kind: 'company' | 'job'): BuiltInAnchorMatch[] {
  const anchors: BuiltInAnchorMatch[] = [];
  const anchorPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = normalizeBuiltInHref(match[1] || '');
    if (!href) {
      continue;
    }

    const isMatch = kind === 'company' ? isBuiltInCompanyHref(href) : isBuiltInJobHref(href);
    if (!isMatch) {
      continue;
    }

    const text = normalizeBuiltInAnchorText(match[2] || '');
    if (!text) {
      continue;
    }

    anchors.push({
      href,
      text,
      index: match.index ?? 0,
    });
  }

  return anchors;
}

function findNearestCompanyAnchor(jobAnchor: BuiltInAnchorMatch, companyAnchors: BuiltInAnchorMatch[]): BuiltInAnchorMatch | null {
  let nearest: BuiltInAnchorMatch | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const companyAnchor of companyAnchors) {
    const distance = Math.abs(companyAnchor.index - jobAnchor.index);
    if (distance > BUILTIN_COMPANY_ANCHOR_DISTANCE_LIMIT) {
      continue;
    }

    if (distance < nearestDistance) {
      nearest = companyAnchor;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function collectBuiltInCompanyJobPairsFromHtml(html: string): NormalizedPortalJob[] {
  const companyAnchors = collectBuiltInAnchors(html, 'company');
  const jobAnchors = collectBuiltInAnchors(html, 'job');
  const rows: NormalizedPortalJob[] = [];
  const seenSourceUrls = new Set<string>();

  for (const jobAnchor of jobAnchors) {
    const sourceUrl = normalizeBuiltInHref(jobAnchor.href);
    if (!sourceUrl || seenSourceUrls.has(sourceUrl)) {
      continue;
    }

    const companyAnchor = findNearestCompanyAnchor(jobAnchor, companyAnchors);
    if (!companyAnchor) {
      continue;
    }

    rows.push({
      title: jobAnchor.text,
      company: companyAnchor.text,
      location: 'Remote',
      remote: 'Unknown',
      type: 'Full-time',
      sourceUrl,
      description: '',
      tags: ['BuiltIn', 'GreenTech', 'TechForGood', 'Climate'],
    });
    seenSourceUrls.add(sourceUrl);
  }

  return rows;
}

function collectBuiltInCompanyJobPairsByTrackId(html: string): NormalizedPortalJob[] {
  const companyByTrackId = new Map<string, string>();
  const jobByTrackId = new Map<string, { title: string; sourceUrl: string }>();

  const companyPattern =
    /<a[^>]*data-id="company-title"[^>]*data-builtin-track-job-id="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(companyPattern)) {
    const trackId = (match[1] || '').trim();
    const company = normalizeBuiltInAnchorText(match[2] || '');
    if (!trackId || !company) {
      continue;
    }
    companyByTrackId.set(trackId, company);
  }

  const jobPattern =
    /<a[^>]*data-id="job-card-title"[^>]*data-builtin-track-job-id="([^"]+)"[^>]*data-alias="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(jobPattern)) {
    const trackId = (match[1] || '').trim();
    const sourceUrl = normalizeBuiltInHref(match[2] || '');
    const title = normalizeBuiltInAnchorText(match[3] || '');
    if (!trackId || !sourceUrl || !title) {
      continue;
    }
    jobByTrackId.set(trackId, { title, sourceUrl });
  }

  const rows: NormalizedPortalJob[] = [];
  for (const [trackId, job] of jobByTrackId.entries()) {
    const company = companyByTrackId.get(trackId);
    if (!company) {
      continue;
    }
    rows.push({
      title: job.title,
      company,
      location: 'Remote',
      remote: 'Unknown',
      type: 'Full-time',
      sourceUrl: job.sourceUrl,
      description: '',
      tags: ['BuiltIn', 'GreenTech', 'TechForGood', 'Climate'],
    });
  }

  return rows;
}

function collectBuiltInEntries(value: unknown): NormalizedPortalJob[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectBuiltInEntries(item));
  if (!value || typeof value !== 'object') return [];
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
        : typeof obj.headline === 'string'
          ? obj.headline
          : '';

  if (isBuiltInJobHref(url) && title) {
    entries.push({
      title: title.trim(),
      company: extractBuiltInCompanyName(obj, 'BuiltIn GreenTech'),
      location: 'Remote',
      remote: 'Unknown',
      type: 'Full-time',
      sourceUrl: url,
      description: '',
      tags: ['BuiltIn', 'GreenTech', 'TechForGood', 'Climate'],
    });
  }

  for (const nested of Object.values(obj)) entries.push(...collectBuiltInEntries(nested));
  return entries;
}

export async function fetchAllBuiltInGreenTechJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];

    for (let page = 1; page <= MAX_BUILTIN_GREENTECH_PAGES; page += 1) {
      const url = page === 1 ? BUILTIN_GREENTECH_JOBS_URL : `${BUILTIN_GREENTECH_JOBS_URL}?page=${page}`;
      const response = await scraperFetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'job-finder-super-scraper/1.0',
        },
      });

      if (!response.ok) {
        if (page === 1) return [];
        break;
      }

      const html = await response.text();
      const pageRows: NormalizedPortalJob[] = [];
      const scriptPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
      for (const match of html.matchAll(scriptPattern)) {
        const raw = (match[1] || '').trim();
        if (!raw) continue;
        try {
          pageRows.push(...collectBuiltInEntries(JSON.parse(raw)));
        } catch {
          // Ignore malformed blocks.
        }
      }

      pageRows.push(...collectBuiltInCompanyJobPairsByTrackId(html));
      pageRows.push(...collectBuiltInCompanyJobPairsFromHtml(html));

      const pageSeenSourceUrls = new Set(pageRows.map((row) => row.sourceUrl));

      const urlPattern = /https:\/\/builtin\.com\/job\/[^"<\s]+/gi;
      for (const match of html.matchAll(urlPattern)) {
        const sourceUrl = (match[0] || '').trim();
        if (!sourceUrl || pageSeenSourceUrls.has(sourceUrl)) continue;
        const slugPart = sourceUrl.split('/job/')[1] || '';
        const slugTitle = slugPart.split('/')[0]?.replace(/[-_]+/g, ' ').trim() || 'BuiltIn Job';
        pageRows.push({
          title: slugTitle,
          company: 'BuiltIn GreenTech',
          location: 'Remote',
          remote: 'Unknown',
          type: 'Full-time',
          sourceUrl,
          description: '',
          tags: ['BuiltIn', 'GreenTech', 'TechForGood', 'Climate'],
        });
      }

      const cardPattern =
        /<a[^>]*data-id="company-title"[^>]*>\s*<span>([^<]+)<\/span>[\s\S]*?<a[^>]*data-id="job-card-title"[^>]*data-alias="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      for (const match of html.matchAll(cardPattern)) {
        const company = (match[1] || '').trim();
        const alias = (match[2] || '').trim();
        const titleFromCard = (match[3] || '').trim();
        if (!company || !alias) continue;

        const sourceUrl = alias.startsWith('http') ? alias : `https://builtin.com${alias}`;
        if (pageSeenSourceUrls.has(sourceUrl)) continue;
        pageRows.push({
          title: titleFromCard || 'BuiltIn Job',
          company,
          location: 'Remote',
          remote: 'Unknown',
          type: 'Full-time',
          sourceUrl,
          description: '',
          tags: ['BuiltIn', 'GreenTech', 'TechForGood', 'Climate'],
        });
        pageSeenSourceUrls.add(sourceUrl);
      }

      if (pageRows.length === 0) break;
      const before = normalized.length;
      normalized.push(...pageRows);
      if (normalized.length === before) break;
      const hasNextPage = new RegExp(`[?&]page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) || /next page|rel="next"/i.test(html);
      if (!hasNextPage) break;
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      const existing = dedup.get(row.sourceUrl);
      if (!existing) {
        dedup.set(row.sourceUrl, row);
        continue;
      }

      const mergedCompany =
        isGenericBuiltInCompany(existing.company) && !isGenericBuiltInCompany(row.company)
          ? row.company
          : existing.company;

      dedup.set(row.sourceUrl, {
        ...existing,
        ...row,
        company: mergedCompany,
      });
    }

    const hydrated: NormalizedPortalJob[] = [];
    for (const job of Array.from(dedup.values())) {
      let description = job.description?.trim() || '';
      if (!description) {
        const detailHtml = await fetchHtml(job.sourceUrl);
        if (detailHtml) {
          description = extractDescriptionFromHtml(detailHtml, job.title, 2000);
        }
      }
      hydrated.push({ ...job, description });
    }

    return normalizeJobsWithCoordinates('BuiltInGreenTech', hydrated);
  } catch (error) {
    console.warn('[BuiltInGreenTechAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
