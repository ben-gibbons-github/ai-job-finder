import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';

export function collectPromptVersions(jobs: ScrapedJob[]): string[] {
  const versions = new Set<string>();
  for (const job of jobs) {
    const version = String(job.scrapedEmployer?.promptVersion ?? '').trim() || '1.0';
    versions.add(version);
  }
  return Array.from(versions).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}
