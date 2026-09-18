import type { ScrapedJob } from '../core/ScrapedJob.js';
import { getDiscoveredCompanySlugs } from '../core/CompanySlugDiscovery.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { isRateLimitedScrapeError, scraperFetch } from '../core/httpCache/ScraperHttpCache.js';

interface PersonioJob {
  title: string;
  location: string;
  department: string;
  employmentType: string;
  description: string;
  sourceUrl: string;
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function getXmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeXml(match?.[1] ?? '');
}

function parsePersonioJobs(xml: string, board: string): PersonioJob[] {
  const positions = xml.match(/<position\b[\s\S]*?<\/position>/gi) ?? [];
  return positions.flatMap((position) => {
    const id = getXmlTag(position, 'id');
    const title = getXmlTag(position, 'name');
    if (!id || !title) return [];
    return [{
      title,
      location: getXmlTag(position, 'office') || getXmlTag(position, 'location') || 'Unknown',
      department: getXmlTag(position, 'department'),
      employmentType: getXmlTag(position, 'employmentType') || 'Unknown',
      description: getXmlTag(position, 'value') || getXmlTag(position, 'jobDescription') || getXmlTag(position, 'description'),
      sourceUrl: `https://${board}.jobs.personio.de/job/${encodeURIComponent(id)}`,
    }];
  });
}

export async function fetchAllPersonioJobs(): Promise<ScrapedJob[]> {
  const boards = Array.from(new Set([
    ...parseCsvEnv(process.env.PERSONIO_BOARDS),
    ...getDiscoveredCompanySlugs('personio'),
  ]));
  const normalized = new Map<string, NormalizedPortalJob>();
  let rateLimited = false;

  for (const board of boards) {
    if (rateLimited) break;
    try {
      const response = await scraperFetch(`https://${encodeURIComponent(board)}.jobs.personio.de/xml?language=en`, {
        method: 'GET', signal: AbortSignal.timeout(25_000), headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
      });
      if (!response.ok) continue;
      for (const job of parsePersonioJobs(await response.text(), board)) {
        normalized.set(job.sourceUrl, {
          title: job.title,
          company: board,
          location: job.location,
          remote: /remote|hybrid/i.test(job.location) ? 'Remote' : 'Unknown',
          type: job.employmentType,
          sourceUrl: job.sourceUrl,
          description: job.description,
          tags: ['Personio', job.department].filter(Boolean),
        });
      }
    } catch (error) {
      if (isRateLimitedScrapeError(error)) {
        rateLimited = true;
        console.warn('[PersonioAPI] Rate limited; stopping the entire Personio scrape.');
      } else {
        console.warn(`[PersonioAPI] Failed board ${board}:`, String(error));
      }
    }
  }

  console.log(`[PersonioAPI] Fetched ${normalized.size} unique jobs from ${boards.length} board candidates.`);
  return normalizeJobsWithCoordinates('Personio', Array.from(normalized.values()));
}