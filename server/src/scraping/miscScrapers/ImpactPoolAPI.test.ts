import { describe, expect, it } from 'vitest';
import { parseImpactPoolJobs } from './ImpactPoolAPI.js';

describe('parseImpactPoolJobs', () => {
  it('extracts the organization, title, location, and seniority from a job card', () => {
    const html = `
      <div class='job'>
        <a data-turbo-frame="_top" href="/jobs/1230837">
          <div class='ip-typography' type='cardTitle'>Correspondents &amp; Video Journalists</div>
          <div class='ip-layout'>
            <div class='ip-typography' type='bodyEmphasis'>
              DW - Deutsche Welle
              <img alt="" src="/ellipse.svg" />
            </div>
            <div class='ip-layout'>
              <div class='ip-typography' type='bodyEmphasis'>Islamabad | Pakistan</div>
              <div class='ip-typography' type='bodyEmphasis'>Mid - Mid level</div>
            </div>
          </div>
        </a>
      </div>
    `;

    expect(parseImpactPoolJobs(html)).toEqual([
      expect.objectContaining({
        title: 'Correspondents & Video Journalists',
        company: 'DW - Deutsche Welle',
        location: 'Islamabad | Pakistan',
        type: 'Mid - Mid level',
        sourceUrl: 'https://www.impactpool.org/jobs/1230837',
      }),
    ]);
  });

  it('marks remote cards from their structured location field', () => {
    const html = `
      <a href='/jobs/1156812'>
        <div type='cardTitle'>Country Director (Roster)</div>
        <div type='bodyEmphasis'>Geneva Call</div>
        <div type='bodyEmphasis'>Remote | Geneva</div>
        <div type='bodyEmphasis'>Senior - Senior level</div>
      </a>
    `;

    expect(parseImpactPoolJobs(html)[0]).toMatchObject({
      company: 'Geneva Call',
      location: 'Remote | Geneva',
      remote: 'Remote',
    });
  });
});