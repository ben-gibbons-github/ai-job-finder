import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllLinkedInJobs } from './LinkedInJobsAPI.js';
import { RateLimitedScrapeError } from '../core/httpCache/ScraperHttpCache.js';

vi.mock('../core/httpCache/ScraperHttpCache.js', async () => {
  const actual = await vi.importActual<typeof import('../core/httpCache/ScraperHttpCache.js')>('../core/httpCache/ScraperHttpCache.js');
  return {
    ...actual,
    scraperFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
  };
});

describe('fetchAllLinkedInJobs', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LINKEDIN_KEYWORDS = 'software engineer,product manager';
    process.env.LINKEDIN_LOCATIONS = 'Remote,Hybrid';
    process.env.LINKEDIN_MAX_KEYWORDS = '2';
    process.env.LINKEDIN_MAX_LOCATIONS = '2';
    process.env.LINKEDIN_PAGES_PER_COMBO = '1';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops the entire LinkedIn scrape once a rate-limited response is detected', async () => {
    const fetchMock = vi.fn(async () => {
      throw new RateLimitedScrapeError(429, 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=product+manager&location=Hybrid&start=0&f_TPR=r2592000', 'GET');
    });

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const jobs = await fetchAllLinkedInJobs();

    expect(jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[LinkedInJobsAPI] Rate limited (429) — stopping the entire LinkedIn scrape.',
    );
  });
});
