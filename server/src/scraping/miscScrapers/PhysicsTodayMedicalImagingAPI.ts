import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import { collectPaginatedHtmlJobs, stripHtmlTags } from '../core/PaginatedHtmlScrapeUtils.js';

const PHYSICS_TODAY_MEDICAL_IMAGING_BASE_URL = 'https://jobs.physicstoday.org/jobs/';
const PHYSICS_TODAY_QUERY = 'medical imaging software engineer';
const MAX_PHYSICS_TODAY_PAGES = 200;

function pageUrl(page: number): string {
  const url = new URL(PHYSICS_TODAY_MEDICAL_IMAGING_BASE_URL);
  url.searchParams.set('keywords', PHYSICS_TODAY_QUERY);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.toString();
}

function titleFromPath(path: string): string {
  const slug = path.split('/').filter(Boolean).pop() || '';
  return slug
    .split('-')
    .filter(Boolean)
    .slice(0, 16)
    .join(' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parsePhysicsTodayMedicalImagingJobs(html: string): NormalizedPortalJob[] {
  const decodedHtml = html.replace(/\\\//g, '/');
  const jobs: NormalizedPortalJob[] = [];
  const seen = new Set<string>();
  const pathPattern = /\/job\/(\d+)\/([^"'\s<>?#]+)\/?(?:\?[^"'\s<>]*)?/gi;

  for (const match of decodedHtml.matchAll(pathPattern)) {
    const jobId = (match[1] || '').trim();
    const slug = (match[2] || '').trim();
    if (!jobId || !slug) {
      continue;
    }

    const sourceUrl = `https://jobs.physicstoday.org/job/${jobId}/${slug}/`;
    if (seen.has(sourceUrl)) {
      continue;
    }
    seen.add(sourceUrl);

    const title = stripHtmlTags(titleFromPath(slug));
    if (!title || /browse jobs|view all jobs|job alerts|saved jobs|sign in/i.test(title)) {
      continue;
    }

    const from = match.index ?? 0;
    const context = decodedHtml.slice(Math.max(0, from - 300), from + 1400);

    jobs.push({
      title,
      company: 'Physics Today Employer',
      location: 'Unknown',
      remote: /\bremote\b|\bhybrid\b|work from home/i.test(context) ? 'Remote' : 'Unknown',
      type: 'Unknown',
      sourceUrl,
      description: '',
      tags: ['Medical', 'Imaging', 'Physics', 'Healthcare'],
    });
  }

  return jobs;
}

export async function fetchAllPhysicsTodayMedicalImagingJobs(): Promise<ScrapedJob[]> {
  try {
    const normalized = await collectPaginatedHtmlJobs({
      sourceName: 'PhysicsTodayMedicalImaging',
      maxPages: MAX_PHYSICS_TODAY_PAGES,
      pageUrl,
      parseJobs: (html) => parsePhysicsTodayMedicalImagingJobs(html),
      hasNextPage: (html, page) => {
        const decodedHtml = html.replace(/\\\//g, '/');
        return new RegExp(`(?:\\?|&)page=${page + 1}(?:["'&]|$)`, 'i').test(decodedHtml);
      },
    });

    return normalizeJobsWithCoordinates('PhysicsTodayMedicalImaging', normalized);
  } catch (error) {
    console.warn('[PhysicsTodayMedicalImagingAPI] Failed to fetch jobs:', String(error));
    return [];
  }
}
