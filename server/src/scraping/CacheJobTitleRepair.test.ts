import { describe, expect, it } from 'vitest';
import type { ScrapedJob } from './ScrapedJob.js';
import { repairGenericCachedJobTitles } from './CacheJobTitleRepair.js';

function makeJob(overrides: Partial<ScrapedJob>): ScrapedJob {
  return {
    name: 'Unknown Role',
    company_name: 'Acme',
    location: 'Remote',
    remote: 'Unknown',
    location_lon: 0,
    location_lat: 0,
    description: '',
    type: 'Unknown',
    source: 'EthicalJobs',
    source_url: 'https://www.ethicaljobs.com.au/members/acme/senior-program-manager-brisbane',
    posted: '2026-01-01',
    impact_number: 0,
    audit_number: 0,
    audit_text: '',
    tags: [],
    ...overrides,
  };
}

describe('repairGenericCachedJobTitles', () => {
  it('replaces generic source-matching title with URL-derived title', () => {
    const input = [
      makeJob({
        name: 'Ethical Jobs',
        source: 'EthicalJobs',
        source_url: 'https://www.ethicaljobs.com.au/members/org/fundraising-specialist-melbourne',
      }),
    ];

    const result = repairGenericCachedJobTitles('EthicalJobs', input);
    expect(result.correctedCount).toBe(1);
    expect(result.jobs[0]?.name).toBe('Fundraising Specialist Melbourne');
  });

  it('keeps non-generic job titles unchanged', () => {
    const input = [
      makeJob({
        name: 'Coordinator - Cultural Safety',
        source_url: 'https://www.ethicaljobs.com.au/members/ywcanswjobs/coordinator-cultural-safety',
      }),
    ];

    const result = repairGenericCachedJobTitles('EthicalJobs', input);
    expect(result.correctedCount).toBe(0);
    expect(result.jobs[0]?.name).toBe('Coordinator - Cultural Safety');
  });

  it('repairs generic ImpactPool title from URL slug', () => {
    const input = [
      makeJob({
        name: 'ImpactPool',
        source: 'ImpactPool',
        source_url: 'https://www.impactpool.org/jobs/1221769/young-professional-information-security',
      }),
    ];

    const result = repairGenericCachedJobTitles('ImpactPool', input);
    expect(result.correctedCount).toBe(1);
    expect(result.jobs[0]?.name).toBe('Young Professional Information Security');
  });

  it('treats domain-like source title as generic and repairs it', () => {
    const input = [
      makeJob({
        name: 'ImpactPool.org',
        source: 'ImpactPool',
        source_url: 'https://www.impactpool.org/jobs/1221769/young-professional-information-security',
      }),
    ];

    const result = repairGenericCachedJobTitles('ImpactPool', input);
    expect(result.correctedCount).toBe(1);
    expect(result.jobs[0]?.name).toBe('Young Professional Information Security');
  });
});
