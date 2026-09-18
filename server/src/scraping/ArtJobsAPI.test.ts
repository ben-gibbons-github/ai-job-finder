import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllArtJobs } from './ArtJobsAPI.js';
import { fetchAllTradeJobs } from './TradeJobsAPI.js';
import { fetchAllMedicalJobs } from './MedicalJobsAPI.js';

describe('ArtJobs and specialized trade/medical feeds', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes ArtJobs listing and detail pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/jobs')) {
          return {
            ok: true,
            text: async () => `
              <html><body>
                <a href="/creative-jobs/nyc/lead-artist">Lead Artist</a>
              </body></html>
            `,
          } as Response;
        }

        return {
          ok: true,
          text: async () => `
            <html><body>
              <h1>Lead Artist</h1>
              <div>Northline Studio</div>
              <div>New York, NY</div>
              <div>Design, gallery, community</div>
            </body></html>
          `,
        } as Response;
      }),
    );

    const jobs = await fetchAllArtJobs();

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs[0]).toMatchObject({
      source: 'ArtJobs',
      name: 'Lead Artist',
      company_name: 'Northline Studio',
      location: 'New York, NY',
    });
  });

  it('normalizes specialized trade and medical feed queries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        text: async () => `
          <rss>
            <channel>
              <item>
                <title>Electrician - Acme Build</title>
                <link>https://example.com/trade/1</link>
                <description>Full-time installation and service work. Location: Denver, CO</description>
                <pubDate>Tue, 20 Aug 2026 00:00:00 GMT</pubDate>
              </item>
              <item>
                <title>Medical Assistant - CareWell Clinic</title>
                <link>https://example.com/med/1</link>
                <description>Healthcare coordination. Location: Seattle, WA</description>
                <pubDate>Tue, 20 Aug 2026 00:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>
        `,
      } as Response)),
    );

    const tradeJobs = await fetchAllTradeJobs();
    const medicalJobs = await fetchAllMedicalJobs();

    expect(tradeJobs.some((job) => job.name.includes('Electrician'))).toBe(true);
    expect(medicalJobs.some((job) => job.name.includes('Medical Assistant'))).toBe(true);
  });
});
