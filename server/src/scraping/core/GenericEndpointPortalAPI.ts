// Loads configurable portal JSON endpoints, follows pagination links, and normalizes records into ScrapedJob objects.
import type { ScrapedJob } from './ScrapedJob.js';
import {
  fetchJson,
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from './PortalIngestionUtils.js';
import { recordPageJobCount } from './ScrapeDebugTelemetry.js';

interface GenericPortalOptions {
  source: string;
  envVar: string;
}

const MAX_PAGINATION_REQUESTS = 100;

function toArray(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) {
      return obj.jobs as Array<Record<string, unknown>>;
    }
    if (Array.isArray(obj.results)) {
      return obj.results as Array<Record<string, unknown>>;
    }
    if (Array.isArray(obj.data)) {
      return obj.data as Array<Record<string, unknown>>;
    }
  }

  return [];
}

function mapGenericRecord(record: Record<string, unknown>, source: string): NormalizedPortalJob | null {
  const title =
    (record.title as string) ||
    (record.name as string) ||
    (record.position as string) ||
    (record.role as string) ||
    '';

  const url =
    (record.url as string) ||
    (record.absolute_url as string) ||
    (record.hostedUrl as string) ||
    (record.apply_url as string) ||
    '';

  if (!title || !url) {
    return null;
  }

  const company =
    (record.company as string) ||
    (record.company_name as string) ||
    (record.organization as string) ||
    source;

  const location =
    (record.location as string) ||
    ((record.locations as string[])?.[0] as string) ||
    'Remote';

  const description =
    (record.description as string) ||
    (record.summary as string) ||
    '';

  const posted =
    (record.posted as string) ||
    (record.datePosted as string) ||
    (record.created_at as string) ||
    (record.updated_at as string) ||
    undefined;

  const tags = Array.isArray(record.tags)
    ? (record.tags as string[])
    : Array.isArray(record.categories)
      ? (record.categories as string[])
      : [];

  return {
    title,
    company,
    location,
    remote: 'Unknown',
    type: (record.type as string) || (record.jobType as string) || 'Full-time',
    sourceUrl: url,
    posted,
    description,
    tags,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toAbsoluteUrl(baseUrl: string, candidate: unknown): string | null {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return null;
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractNextUrls(payload: unknown, currentUrl: string): string[] {
  const out = new Set<string>();
  const root = asObject(payload);
  if (!root) {
    return [];
  }

  const directCandidates = [
    root.next,
    root.next_url,
    root.nextPage,
    root.next_page,
  ];

  for (const candidate of directCandidates) {
    const absolute = toAbsoluteUrl(currentUrl, candidate);
    if (absolute) {
      out.add(absolute);
    }
  }

  const links = asObject(root.links);
  if (links) {
    const linkCandidates = [
      links.next,
      links.next_url,
      links.next_page,
      links.next_page_url,
    ];

    for (const candidate of linkCandidates) {
      const absolute = toAbsoluteUrl(currentUrl, candidate);
      if (absolute) {
        out.add(absolute);
      }
    }
  }

  const pagination = asObject(root.pagination);
  if (pagination) {
    const absolute = toAbsoluteUrl(currentUrl, pagination.next);
    if (absolute) {
      out.add(absolute);
    }
  }

  return Array.from(out);
}

export async function fetchPortalJobsFromEndpointList(options: GenericPortalOptions): Promise<ScrapedJob[]> {
  const endpointList = parseCsvEnv(process.env[options.envVar]);
  if (endpointList.length === 0) {
    console.warn(
      `[${options.source}] No endpoints configured in ${options.envVar}; skipping direct endpoint ingestion.`,
    );
    return [];
  }

  const normalized: NormalizedPortalJob[] = [];

  for (const endpoint of endpointList) {
    const visited = new Set<string>();
    const queue: string[] = [endpoint];
    let requests = 0;

    while (queue.length > 0 && requests < MAX_PAGINATION_REQUESTS) {
      const current = queue.shift()!;
      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      requests += 1;

      try {
        const payload = await fetchJson(current);
        const rows = toArray(payload);
        recordPageJobCount({
          sourceName: options.source,
          query: current,
          page: requests,
          jobsFound: rows.length,
          sourceUrls: rows
            .map((row) => mapGenericRecord(row, options.source)?.sourceUrl)
            .filter((url): url is string => Boolean(url)),
        });
        for (const row of rows) {
          const mapped = mapGenericRecord(row, options.source);
          if (mapped) {
            normalized.push(mapped);
          }
        }

        const nextUrls = extractNextUrls(payload, current);
        for (const nextUrl of nextUrls) {
          if (!visited.has(nextUrl)) {
            queue.push(nextUrl);
          }
        }
      } catch (error) {
        console.warn(`[${options.source}] Failed endpoint ${current}:`, String(error));
      }
    }
  }

  return normalizeJobsWithCoordinates(options.source, normalized);
}
