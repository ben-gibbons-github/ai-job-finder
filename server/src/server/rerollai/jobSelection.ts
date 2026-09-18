import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';
import type { RerollPayload } from './types.js';

function normalizeCompanyKey(name: unknown): string {
  return String(name ?? '').trim().toLowerCase();
}

export function selectSeedJob(jobs: ScrapedJob[], payload: RerollPayload): ScrapedJob | undefined {
  return payload.source_url
    ? jobs.find((job) => job.source_url === payload.source_url)
    : jobs.find((job) => job.name === payload.name && job.company_name === payload.company_name);
}

export function selectCompanyJobs(jobs: ScrapedJob[], seedJob: ScrapedJob): {
  companyJobs: ScrapedJob[];
  representativeJob: ScrapedJob;
} {
  const companyKey = normalizeCompanyKey(seedJob.scrapedEmployer?.name || seedJob.company_name);
  const companyJobs = jobs.filter((job) => {
    const candidateKey = normalizeCompanyKey(job.scrapedEmployer?.name || job.company_name);
    return candidateKey.length > 0 && candidateKey === companyKey;
  });

  return {
    companyJobs,
    representativeJob: companyJobs[0] ?? seedJob,
  };
}
