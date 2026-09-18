import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHealthECareersJobs } from './HealthECareersAPI.js';

function readFixture(relativePath: string): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return readFileSync(path.join(__dirname, relativePath), 'utf8');
}

describe('parseHealthECareersJobs', () => {
  it('extracts a real HealthE Careers listing into a usable record with meaningful description text', () => {
    const html = readFixture('../fixtures/healthecareers-search.html');

    const jobs = parseHealthECareersJobs(html);

    expect(jobs.length).toBeGreaterThan(0);

    const hospitalist = jobs.find((job) => job.title.includes('Hospitalist APP PRN'));

    expect(hospitalist).toMatchObject({
      title: 'Hospitalist APP PRN Northern Virginia',
      company: 'UVA Health',
      location: 'Manassas, Virginia',
      sourceUrl: 'https://www.healthecareers.com/job/hospitalist-app-prn-northern-virginia/13593173',
      remote: 'Unknown',
      type: 'Unknown',
    });
    expect(hospitalist?.description).toContain('Hospitalist APP PRN opportunity');
    expect(hospitalist?.description).toContain('UVA Health');
  });
});
