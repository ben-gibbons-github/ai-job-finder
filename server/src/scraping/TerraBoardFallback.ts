import {
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import type { ScrapedJob } from './ScrapedJob.js';

const DEFAULT_TERRA_SEARCH_QUERIES = [
  'software engineer',
  'data engineer',
  'data analyst',
  'machine learning',
  'ai engineer',
  'product manager',
  'project manager',
  'operations',
  'policy',
  'research',
  'climate',
  'energy',
  'sustainability',
  'supply chain',
  'logistics',
  'marketing',
  'sales',
  'customer success',
  'finance',
  'accounting',
  'human resources',
  'talent acquisition',
  'healthcare',
  'public health',
  'nonprofit',
  'government',
  'education',
  'operations manager',
  'administrative assistant',
  'business analyst',
];
const DEFAULT_MAX_TERRA_PAGES = 60;

function getTerraSearchQueries(): string[] {
  const envQueries = parseCsvEnv(process.env.TERRA_FALLBACK_QUERIES);
  if (envQueries.length > 0) {
    return Array.from(new Set(envQueries));
  }

  return DEFAULT_TERRA_SEARCH_QUERIES;
}

function getMaxTerraPages(): number {
  return Math.max(1, Number(process.env.TERRA_FALLBACK_MAX_PAGES || DEFAULT_MAX_TERRA_PAGES));
}

function decodeEscaped(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } catch {
    return value;
  }
}

interface TerraExtracted {
  title: string;
  url: string;
  description?: string;
  company?: string;
}

function buildTokenMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const tokenPattern = /"([A-Za-z0-9]{1,4})":"([\s\S]*?)"/g;

  for (const match of html.matchAll(tokenPattern)) {
    const key = match[1];
    const value = decodeEscaped(match[2] || '');
    if (!key || !value) {
      continue;
    }
    map.set(key, value);
  }

  return map;
}

function resolveTokenValue(raw: string, tokenMap: Map<string, string>): string {
  let current = decodeEscaped(raw || '').trim();
  const seen = new Set<string>();

  for (let i = 0; i < 6; i += 1) {
    if (!current || seen.has(current)) {
      break;
    }
    seen.add(current);

    const next = tokenMap.get(current);
    if (!next) {
      break;
    }

    current = next.trim();
  }

  return current;
}

function extractFromHtml(html: string): TerraExtracted[] {
  const tokenMap = buildTokenMap(html);
  const pattern = /"job_title":"([^"]+)"\s*,\s*"job_url":"([^"]+)"[\s\S]{0,800}?"job_description":"([\s\S]*?)"/g;
  const out: TerraExtracted[] = [];

  for (const match of html.matchAll(pattern)) {
    const title = resolveTokenValue(match[1] || '', tokenMap);
    const url = resolveTokenValue(match[2] || '', tokenMap);
    const description = resolveTokenValue(match[3] || '', tokenMap);

    if (!title || !url || !/^https?:\/\//i.test(url)) {
      continue;
    }

    out.push({ title, url, description });
  }

  // Deduplicate by URL.
  const deduped = new Map<string, TerraExtracted>();
  for (const row of out) {
    deduped.set(row.url, row);
  }

  return Array.from(deduped.values());
}

async function fetchTerraHtmlJobs(): Promise<TerraExtracted[]> {
  const queries = getTerraSearchQueries();
  const maxPages = getMaxTerraPages();
  const allRows: TerraExtracted[] = [];

  for (const query of queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url =
        page === 1
          ? `https://www.terra.do/climate-jobs/job-board/search/?query=${encodeURIComponent(query)}`
          : `https://www.terra.do/climate-jobs/job-board/search/?query=${encodeURIComponent(query)}&page=${page}`;

      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(30_000),
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'job-finder-super-scraper/1.0',
          },
        });

        if (!res.ok) {
          if (page === 1) {
            continue;
          }
          break;
        }

        const html = await res.text();
        const pageRows = extractFromHtml(html);
        if (pageRows.length === 0) {
          break;
        }

        allRows.push(...pageRows);

        const hasNextPage =
          new RegExp(`[?&]page=${page + 1}(?:[^0-9]|$)`, 'i').test(html) ||
          /next page|rel="next"/i.test(html);
        if (!hasNextPage) {
          break;
        }
      } catch {
        // Continue attempting other query variants.
        break;
      }
    }
  }

  const deduped = new Map<string, TerraExtracted>();
  for (const row of allRows) {
    deduped.set(row.url, row);
  }

  return Array.from(deduped.values());
}

export async function fetchPortalFallbackJobs(
  source: string,
  urlMatcher: (url: string) => boolean,
): Promise<ScrapedJob[]> {
  try {
    const extracted = await fetchTerraHtmlJobs();
    const normalized: NormalizedPortalJob[] = extracted
      .filter((row) => urlMatcher(row.url))
      .map((row) => ({
        title: row.title,
        company: row.company || source,
        location: 'Remote',
        remote: 'Unknown',
        type: 'Full-time',
        sourceUrl: row.url,
        description: row.description || '',
        tags: [source, 'terra-fallback'],
      }));

    return normalizeJobsWithCoordinates(source, normalized);
  } catch (error) {
    console.warn('[TerraBoardFallback] Failed to build portal fallback jobs:', String(error));
    return [];
  }
}

export async function fetchTerraAggregateJobs(): Promise<ScrapedJob[]> {
  const extracted = await fetchTerraHtmlJobs();
  const normalized: NormalizedPortalJob[] = extracted.map((row) => ({
    title: row.title,
    company: row.company || 'Terra',
    location: 'Remote',
    remote: 'Unknown',
    type: 'Full-time',
    sourceUrl: row.url,
    description: row.description || '',
    tags: ['Terra'],
  }));

  return normalizeJobsWithCoordinates('Terra', normalized);
}
