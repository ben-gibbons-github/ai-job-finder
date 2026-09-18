import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';
import { getCompanyQualityScore } from '../../searching/SearchUtils.js';

export function logQualityExtremes(jobs: ScrapedJob[], count = 10): void {
  if (jobs.length === 0) {
    console.log('[Startup] No jobs available for quality-extremes logging.');
    return;
  }

  const top = jobs.slice(0, count);
  const bottom = jobs.slice(Math.max(0, jobs.length - count));

  console.log(`[Startup] Top ${top.length} jobs after quality pre-sort:`);
  top.forEach((job, index) => {
    const score = getCompanyQualityScore(job);
    console.log(`  ${index + 1}. score=${score.toFixed(4)} | company=${job.company_name} | job=${job.name}`);
  });

  console.log(`[Startup] Bottom ${bottom.length} jobs after quality pre-sort:`);
  bottom.forEach((job, index) => {
    const score = getCompanyQualityScore(job);
    console.log(`  ${jobs.length - bottom.length + index + 1}. score=${score.toFixed(4)} | company=${job.company_name} | job=${job.name}`);
  });
}
