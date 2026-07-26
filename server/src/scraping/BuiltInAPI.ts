import type { ScrapedJob } from './ScrapedJob.js';
import { fetchPortalJobsFromEndpointList } from './GenericEndpointPortalAPI.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

const BUILTIN_JOBS_URL = 'https://www.builtin.com/jobs';
const MAX_BUILTIN_PAGES = 50;

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

function collectBuiltInEntries(value: unknown): NormalizedPortalJob[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectBuiltInEntries(item));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const obj = value as Record<string, unknown>;
  const entries: NormalizedPortalJob[] = [];
  const url = typeof obj.url === 'string' ? obj.url : '';
  const title =
    typeof obj.name === 'string'
      ? obj.name
      : typeof obj.title === 'string'
        ? obj.title
        : '';

  if (url.includes('builtin.com') && title) {
    entries.push({
      title: title.trim(),
      company: extractBuiltInCompanyName(obj, 'BuiltIn'),
      location: 'Remote',
      remote: 'Unknown',
      type: 'Full-time',
      sourceUrl: url,
      description: '',
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
      const response = await fetch(url, {
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
      for (const match of html.matchAll(scriptPattern)) {
        const raw = (match[1] || '').trim();
        if (!raw) {
          continue;
        }
        try {
          const parsed = JSON.parse(raw);
          pageRows.push(...collectBuiltInEntries(parsed));
        } catch {
          // Ignore malformed blocks and continue parsing other JSON-LD scripts.
        }
      }

      // BuiltIn frequently renders links directly in HTML without JSON-LD.
      const urlPattern = /https:\/\/builtin\.com\/job\/[^"<\s]+/gi;
      for (const match of html.matchAll(urlPattern)) {
        const sourceUrl = (match[0] || '').trim();
        if (!sourceUrl) {
          continue;
        }

        const slugPart = sourceUrl.split('/job/')[1] || '';
        const slugTitle = slugPart.split('/')[0]?.replace(/[-_]+/g, ' ').trim() || 'BuiltIn Job';

        pageRows.push({
          title: slugTitle,
          company: 'BuiltIn',
          location: 'Remote',
          remote: 'Unknown',
          type: 'Full-time',
          sourceUrl,
          description: '',
          tags: ['BuiltIn'],
        });
      }

      const cardPattern =
        /<a[^>]*data-id="company-title"[^>]*>\s*<span>([^<]+)<\/span>[\s\S]*?<a[^>]*data-id="job-card-title"[^>]*data-alias="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      for (const match of html.matchAll(cardPattern)) {
        const company = (match[1] || '').trim();
        const alias = (match[2] || '').trim();
        const title = (match[3] || '').trim();
        if (!company || !alias) {
          continue;
        }

        const sourceUrl = alias.startsWith('http') ? alias : `https://builtin.com${alias}`;
        pageRows.push({
          title: title || 'BuiltIn Job',
          company,
          location: 'Remote',
          remote: 'Unknown',
          type: 'Full-time',
          sourceUrl,
          description: '',
          tags: ['BuiltIn'],
        });
      }

      if (pageRows.length === 0) {
        break;
      }

      const before = normalized.length;
      normalized.push(...pageRows);
      const added = normalized.length - before;
      if (added === 0) {
        break;
      }

      const hasNextPage =
        new RegExp(`[?&]page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) ||
        /next page|rel="next"/i.test(html);
      if (!hasNextPage) {
        break;
      }
    }

    if (normalized.length === 0) {
      return [];
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
    return normalizeJobsWithCoordinates('BuiltIn', Array.from(dedup.values()));
  } catch {
    return [];
  }
}

export async function fetchAllBuiltInJobs(): Promise<ScrapedJob[]> {
  const direct = await fetchPortalJobsFromEndpointList({
    source: 'BuiltIn',
    envVar: 'BUILTIN_FEED_ENDPOINTS',
  });

  if (direct.length > 0) {
    return direct;
  }

  const builtinPageJobs = await fetchBuiltInPageJobs();
  if (builtinPageJobs.length > 0) {
    return builtinPageJobs;
  }

  return fetchPortalFallbackJobs('BuiltIn', (url) => /builtin\.com/i.test(url));
}
