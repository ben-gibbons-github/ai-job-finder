import { describe, expect, it } from 'vitest';
import { parseCharityJobs } from './CharityJobAPI.js';

describe('CharityJob parser', () => {
  it('reads the employer from the listing organisation field', () => {
    const html = `
      <div class="job-title">
        <a href="https://www.charityjob.co.uk/jobs/worldwide-radiology/finance-governance-lead/1080761?tsId=6">
          Finance &amp; Governance Lead
        </a>
      </div>
      <div class="organisation">Worldwide Radiology, Liverpool (Hybrid)</div>
    `;

    expect(parseCharityJobs(html)).toEqual([
      expect.objectContaining({
        title: 'Finance &amp; Governance Lead',
        company: 'Worldwide Radiology',
        location: 'Liverpool',
        remote: 'Remote',
      }),
    ]);
  });
});