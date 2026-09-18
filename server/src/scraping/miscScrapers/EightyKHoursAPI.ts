import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchPortalJobsFromEndpointList } from '../core/GenericEndpointPortalAPI.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';
import { scraperFetch } from "../core/httpCache/ScraperHttpCache.js";

const ALGOLIA_APP_ID = 'W6KM1UDIB3';
const ALGOLIA_API_KEY = process.env.EIGHTYK_HOURS_ALGOLIA_API_KEY ?? '';
const ALGOLIA_INDEX = 'jobs_prod_super_ranked';
const MAX_80K_HOURS_PAGES = 400;

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetch80KFromAlgolia(): Promise<ScrapedJob[]> {
  if (!ALGOLIA_API_KEY) {
    return [];
  }

  try {
    const endpoint = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
    const normalized: NormalizedPortalJob[] = [];
    let totalPages = 1;

    for (let page = 0; page < Math.min(totalPages, MAX_80K_HOURS_PAGES); page += 1) {
      const response = await scraperFetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'Content-Type': 'application/json',
          'X-Algolia-API-Key': ALGOLIA_API_KEY,
          'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        },
        body: JSON.stringify({
          params: `query=&hitsPerPage=250&page=${page}`,
        }),
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        hits?: Array<Record<string, unknown>>;
        nbPages?: number;
      };

      if (typeof payload.nbPages === 'number' && Number.isFinite(payload.nbPages)) {
        totalPages = Math.max(1, payload.nbPages);
      }

      const hits = Array.isArray(payload.hits) ? payload.hits : [];
      for (const hit of hits) {
        const title = typeof hit.title === 'string' ? hit.title.trim() : '';
        const sourceUrl =
          typeof hit.url_external === 'string'
            ? hit.url_external
            : typeof hit.url === 'string'
              ? hit.url
              : '';
        const company =
          typeof hit.organization_name === 'string'
            ? hit.organization_name
            : typeof hit.organisation_name === 'string'
              ? hit.organisation_name
              : '80kHours';
        const location = typeof hit.location === 'string' ? hit.location : 'Unknown';
        const type = typeof hit.contract_type === 'string' ? hit.contract_type : 'Unknown';
        const description =
          typeof hit.description_short === 'string' ? stripHtmlTags(hit.description_short) : '';

        if (!title || !sourceUrl) {
          continue;
        }

        normalized.push({
          title,
          company,
          location,
          remote: /remote/i.test(location) ? 'Remote' : 'Unknown',
          type,
          sourceUrl,
          description,
          tags: ['80kHours'],
        });
      }
    }

    if (normalized.length === 0) {
      return [];
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('80kHours', Array.from(dedup.values()));
  } catch {
    return [];
  }
}

export async function fetchAll80KHoursJobs(): Promise<ScrapedJob[]> {
  const direct = await fetchPortalJobsFromEndpointList({
    source: '80kHours',
    envVar: 'EIGHTYK_HOURS_FEED_ENDPOINTS',
  });

  if (direct.length > 0) {
    return direct;
  }

  const fromAlgolia = await fetch80KFromAlgolia();
  if (fromAlgolia.length > 0) {
    return fromAlgolia;
  }

  return fetchPortalFallbackJobs('80kHours', (url) => /80000hours\.org/i.test(url));
}
