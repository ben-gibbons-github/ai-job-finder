import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';

const ARTJOBS_BASE_URL = 'https://www.artjobs.com/jobs';
const MAX_ARTJOBS_PAGES = 25;

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDetailFields(detailHtml: string, fallbackTitle: string): { title: string; company: string; location: string; description: string } {
  const blocks = Array.from(detailHtml.matchAll(/<(?:div|p|li|span|h[1-6]|strong)[^>]*>([\s\S]*?)<\/(?:div|p|li|span|h[1-6]|strong)>/gi))
    .map((match) => stripHtml(match[1] || ''))
    .map((text) => text.replace(/^[\-•\*\s]+|[\-•\*\s]+$/g, ''))
    .filter(Boolean);

  const titleFromHtml = (detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || detailHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const title = stripHtml(titleFromHtml || fallbackTitle || 'Art job');

  const nonTitleBlocks = blocks.filter((block) => block !== title);
  const locationCandidate = nonTitleBlocks.find((block) =>
    /(?:^|\s)(?:Remote|Hybrid|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*,\s*[A-Z]{2})\b/.test(block)
    || /(?:United States|Canada|UK|Europe)/i.test(block),
  ) || 'Unknown';

  const companyCandidate = nonTitleBlocks.find((block) =>
    block !== locationCandidate
    && !/remote|hybrid|design|gallery|community|creative|art|job|jobs|location|full[- ]?time|artist/i.test(block)
    && block.length > 2,
  ) || 'ArtJobs';

  const descriptionBlocks = nonTitleBlocks.filter((block) =>
    block !== companyCandidate
    && block !== locationCandidate
    && !/remote|hybrid|full[- ]?time|location|company|artist|creative|gallery|community/i.test(block)
    && block.length > 10,
  );

  return {
    title,
    company: companyCandidate,
    location: locationCandidate,
    description: descriptionBlocks.join(' ') || 'Creative arts position opportunity.',
  };
}

async function fetchDetailPage(relativeUrl: string): Promise<{ title: string; company: string; location: string; description: string }> {
  const url = new URL(relativeUrl, ARTJOBS_BASE_URL).toString();
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'job-finder-super-scraper/1.0',
    },
  });

  if (!response.ok) {
    return {
      title: stripHtml(relativeUrl.split('/').filter(Boolean).pop() || 'Art Job'),
      company: 'ArtJobs',
      location: 'Unknown',
      description: 'Creative arts position opportunity.',
    };
  }

  const html = await response.text();
  return extractDetailFields(html, stripHtml(relativeUrl.split('/').filter(Boolean).pop() || 'Art Job'));
}

function parseArtJobsPage(html: string): string[] {
  const linkPattern = /<a[^>]+href="(\/creative-jobs\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const urls: string[] = [];

  for (const match of html.matchAll(linkPattern)) {
    const relativeUrl = (match[1] || '').trim();
    const rawTitle = stripHtml(match[2] || '');

    if (!relativeUrl || !rawTitle || /jobs|open-calls|news|companies|page/i.test(rawTitle)) {
      continue;
    }

    urls.push(relativeUrl);
  }

  return [...new Set(urls)];
}

async function fetchArtJobsPage(page: number): Promise<string[]> {
  const url = page === 1 ? ARTJOBS_BASE_URL : `${ARTJOBS_BASE_URL}?page=${page}`;
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
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }
    return [];
  }

  const html = await response.text();
  return parseArtJobsPage(html);
}

export async function fetchAllArtJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized: NormalizedPortalJob[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= MAX_ARTJOBS_PAGES; page += 1) {
      const relativeUrls = await fetchArtJobsPage(page);
      if (relativeUrls.length === 0) {
        break;
      }

      for (const relativeUrl of relativeUrls) {
        if (seen.has(relativeUrl)) {
          continue;
        }
        seen.add(relativeUrl);

        const detail = await fetchDetailPage(relativeUrl);
        normalized.push({
          title: detail.title,
          company: detail.company,
          location: detail.location,
          remote: /remote|hybrid|wfh/i.test(detail.location) || /remote|hybrid|wfh/i.test(detail.description) ? 'Remote' : 'Unknown',
          type: 'Unknown',
          sourceUrl: new URL(relativeUrl, ARTJOBS_BASE_URL).toString(),
          description: detail.description,
          tags: ['ArtJobs', 'Art', 'Creative'],
        });
      }
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }

    return normalizeJobsWithCoordinates('ArtJobs', Array.from(dedup.values()));
  } catch (error) {
    console.warn('[ArtJobsAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
