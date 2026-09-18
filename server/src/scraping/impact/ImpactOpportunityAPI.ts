import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, fetchHtml, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';
import { extractDescriptionFromHtml } from '../core/ScrapeDescriptionUtils.js';

const IMPACT_OPPORTUNITY_URL = 'https://impactopportunity.org/jobs/';
const MAX_IMPACT_OPPORTUNITY_PAGES = 200;

function pageUrl(page: number): string {
  const url = new URL(IMPACT_OPPORTUNITY_URL);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function parseImpactOpportunityJobs(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const linkPattern =
    /<a[^>]+href="(https:\/\/impactopportunity\.org\/job\/[0-9]+\/[^"\s]+\/)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const sourceUrl = (match[1] || '').trim();
    const title = stripHtmlTags(match[2] || '');

    if (!sourceUrl || !title) {
      continue;
    }

    if (/impact opportunity|navigation menu|email me jobs/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = html.slice(Math.max(0, from - 450), from + 1200);
    const companyMatch = context.match(/Hiring Organization:\s*([^\n\r]{2,100})/i);
    const locationMatch = context.match(/\b(HYBRID|REMOTE(?:\s*\([^)]*\))?|ONSITE|[A-Z][A-Za-z .'-]+,\s*[A-Z]{2})\b/i);

    jobs.push({
      title,
      company: (companyMatch?.[1] || 'Impact Opportunity').trim(),
      location: locationMatch?.[1]?.trim() || 'Unknown',
      remote: /\bremote\b/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Full-Time',
      sourceUrl,
      description: '',
      tags: ['ImpactOpportunity', 'Nonprofit', 'Leadership'],
    });
  }

  return jobs;
}

async function hydrateImpactOpportunityDescriptions(jobs: NormalizedPortalJob[]): Promise<NormalizedPortalJob[]> {
  const hydrated: NormalizedPortalJob[] = [];

  for (const job of jobs) {
    let description = job.description?.trim() || '';
    if (!description) {
      const detailHtml = await fetchHtml(job.sourceUrl);
      if (detailHtml) {
        description = extractDescriptionFromHtml(detailHtml, job.title, 2000);
      }
    }

    hydrated.push({ ...job, description });
  }

  return hydrated;
}

export async function fetchAllImpactOpportunityJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'ImpactOpportunity',
      maxPages: MAX_IMPACT_OPPORTUNITY_PAGES,
      pageUrl,
      parseJobs: (html) => parseImpactOpportunityJobs(html),
      hasNextPage: (html) => /load more|next/i.test(html),
    });

    const hydrated = await hydrateImpactOpportunityDescriptions(normalized);
    return normalizeJobsWithCoordinates('ImpactOpportunity', hydrated);
  } catch (error) {
    console.warn('[ImpactOpportunityAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
