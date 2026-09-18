import type { ScrapedJob } from './ScrapedJob.js';

export function normalizeJobKeyPart(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function buildScrapedJobKey(job: ScrapedJob): string {
  const sourceUrl = normalizeJobKeyPart(job.source_url);
  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  return [
    'fallback',
    normalizeJobKeyPart(job.source),
    normalizeJobKeyPart(job.name),
    normalizeJobKeyPart(job.company_name),
    normalizeJobKeyPart(job.location),
    normalizeJobKeyPart(job.posted),
  ].join('|');
}
