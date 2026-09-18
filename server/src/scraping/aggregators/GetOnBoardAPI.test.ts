import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllGetOnBoardJobs } from './GetOnBoardAPI.js';

describe('fetchAllGetOnBoardJobs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes Get on Board jobs from a paginated JSON payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          jobs: [
            {
              title: 'Senior Product Engineer',
              company: { name: 'Northstar Labs' },
              location: 'Remote',
              remote: true,
              type: 'Full-time',
              url: 'https://example.com/jobs/123',
              created_at: '2026-08-20T00:00:00Z',
              description: '<p>Build the platform.</p>',
              tags: ['Product', 'Remote'],
            },
          ],
          total_pages: 1,
          page: 1,
        }),
      })),
    );

    const jobs = await fetchAllGetOnBoardJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: 'GetOnBoard',
      name: 'Senior Product Engineer',
      company_name: 'Northstar Labs',
      location: 'Remote',
      remote: 'Remote',
      type: 'Full-time',
      source_url: 'https://example.com/jobs/123',
    });
    expect(jobs[0].description).toContain('Build the platform.');
  });
});
