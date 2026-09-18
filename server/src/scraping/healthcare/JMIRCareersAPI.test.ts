import { describe, expect, it } from 'vitest';
import { parseJmirCareersJobs } from './JMIRCareersAPI.js';

describe('parseJmirCareersJobs', () => {
  it('extracts a listing into a useful normalized record with meaningful description text', () => {
    const html = `
      <html>
        <body>
          <div class="job-card">
            <a href="/jobs/67890/clinical-research-specialist/">
              Clinical Research Specialist
            </a>
            <div id="job-results-employer"><span>JMIR Publications</span></div>
            <div id="job-results-location"><span>Remote</span></div>
            <div class="job-snippet">
              Help design digital health research studies and support evidence generation for innovative
              patient-centered tools.
            </div>
          </div>
        </body>
      </html>
    `;

    const jobs = parseJmirCareersJobs(html);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Clinical Research Specialist',
      company: 'JMIR Publications',
      location: 'Remote',
      sourceUrl: 'https://careers.jmir.org/jobs/67890/clinical-research-specialist/',
      type: 'Unknown',
      remote: 'Remote',
    });
    expect(jobs[0].description).toContain('digital health research studies');
    expect(jobs[0].description).toContain('patient-centered tools');
  });
});
