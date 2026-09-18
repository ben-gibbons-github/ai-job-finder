import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllJoobleJobs } from './JoobleAPI.js';
import { fetchAllLinkedInJobs } from './LinkedInJobsAPI.js';
import { RateLimitedScrapeError } from './ScraperHttpCache.js';

describe('fetchAllJoobleJobs', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JOOBLE_API_KEY = 'test-key';
    process.env.JOOBLE_KEYWORDS = 'kafka engineer';
    process.env.JOOBLE_LOCATIONS = 'South Africa';
    process.env.JOOBLE_MAX_KEYWORDS = '1';
    process.env.JOOBLE_MAX_LOCATIONS = '1';
    process.env.JOOBLE_MAX_PAGES = '5';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops the whole scrape when Jooble responds with a 403', async () => {
    const apiKey = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_API_KEY = apiKey;

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ jobs: [] }), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[JoobleAPI] Received 403 Forbidden — stopping the entire Jooble scrape.');
  });

  it('stops the whole scrape when scraper cache raises a rate-limited error', async () => {
    const apiKey = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_API_KEY = apiKey;

    const fetchMock = vi.fn(async () => {
      throw new RateLimitedScrapeError(403, `https://jooble.org/api/${apiKey}`, 'POST');
    });

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[JoobleAPI] Received 403 Forbidden — stopping the entire Jooble scrape.');
  });

  it('turns Jooble search HTML into a readable description', async () => {
    process.env.JOOBLE_API_KEY = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_MAX_PAGES = '1';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      jobs: [{
        title: 'Platform Engineer',
        company: 'Example Co',
        location: 'Remote',
        link: 'https://jooble.org/away/example',
        snippet: '&nbsp;...languages like Go, Rust, Java, or <b>C++.</b>Collaboration &amp; communication...&nbsp;',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].description).toBe('languages like Go, Rust, Java, or C++. Collaboration & communication');
  });

  it('prefers a full Jooble description when the API supplies one', async () => {
    process.env.JOOBLE_API_KEY = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_MAX_PAGES = '1';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      jobs: [{
        title: 'Platform Engineer',
        company: 'Example Co',
        location: 'Remote',
        link: 'https://jooble.org/away/example-full',
        description: '<p>This is the complete &amp; detailed role description.</p>',
        snippet: '&nbsp;...short <b>snippet</b>...&nbsp;',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].description).toBe('This is the complete & detailed role description.');
  });
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
      throw new RateLimitedScrapeError(
        429,
        'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=product+manager&location=Hybrid&start=0&f_TPR=r2592000',
        'GET',
      );
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
