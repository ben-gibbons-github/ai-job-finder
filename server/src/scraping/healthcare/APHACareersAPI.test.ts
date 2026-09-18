import { describe, expect, it } from 'vitest';
import { parseAphaCareersJobs } from './APHACareersAPI.js';

describe('parseAphaCareersJobs', () => {
  it('extracts a real APHA Careers job card into a usable normalized record', () => {
    const html = `
      <html>
        <body>
          <div class="job-card">
            <a href="/jobs/12345/senior-epidemiologist/">
              Senior Epidemiologist
            </a>
            <div id="job-results-employer"><span>American Public Health Association</span></div>
            <div id="job-results-location"><span>Washington, DC</span></div>
            <div class="job-snippet">
              We are seeking a Senior Epidemiologist to lead public health surveillance and partner with
              program teams to translate data into action.
            </div>
          </div>
        </body>
      </html>
    `;

    const jobs = parseAphaCareersJobs(html);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Senior Epidemiologist',
      company: 'American Public Health Association',
      location: 'Washington, DC',
      sourceUrl: 'https://careers.apha.org/jobs/12345/senior-epidemiologist/',
      type: 'Unknown',
      remote: 'Unknown',
    });
    expect(jobs[0].description).toContain('public health surveillance');
    expect(jobs[0].description).toContain('Senior Epidemiologist');
  });
});
