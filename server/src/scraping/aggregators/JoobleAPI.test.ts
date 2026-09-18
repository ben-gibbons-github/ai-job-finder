import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllJoobleJobs } from './JoobleAPI.js';
import { fetchAllLinkedInJobs } from './LinkedInJobsAPI.js';
import { RateLimitedScrapeError, resetRateLimitCache } from '../core/httpCache/ScraperHttpCache.js';

describe('fetchAllJoobleJobs', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetRateLimitCache();
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

  it('retries a 403 up to the configured limit and then gives up', async () => {
    const apiKey = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_API_KEY = apiKey;
    process.env.JOOBLE_RATE_LIMIT_MAX_ATTEMPTS = '3';
    process.env.JOOBLE_RATE_LIMIT_RETRY_DELAY_MS = '0';

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
    // The shared HTTP cache marks the host as rate-limited after the first 403,
    // so later attempts are rejected locally without hitting fetch again.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[JoobleAPI] Rate limited 3 time(s) for keyword="kafka engineer" location="South Africa" page=1 — giving up on the entire Jooble scrape.',
    );
  });

  it('retries when the scraper cache raises a rate-limited error and then gives up', async () => {
    const apiKey = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_API_KEY = apiKey;
    process.env.JOOBLE_RATE_LIMIT_MAX_ATTEMPTS = '3';
    process.env.JOOBLE_RATE_LIMIT_RETRY_DELAY_MS = '0';

    const fetchMock = vi.fn(async () => {
      throw new RateLimitedScrapeError(403, `https://jooble.org/api/${apiKey}`, 'POST');
    });

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      '[JoobleAPI] Rate limited 3 time(s) for keyword="kafka engineer" location="South Africa" page=1 — giving up on the entire Jooble scrape.',
    );
  });

  it('recovers after a rate limit if a later attempt succeeds', async () => {
    const apiKey = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_API_KEY = apiKey;
    process.env.JOOBLE_MAX_PAGES = '1';
    process.env.JOOBLE_MAX_DETAIL_FETCHES = '0';
    process.env.JOOBLE_RATE_LIMIT_MAX_ATTEMPTS = '3';
    process.env.JOOBLE_RATE_LIMIT_RETRY_DELAY_MS = '0';

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new RateLimitedScrapeError(403, `https://jooble.org/api/${apiKey}`, 'POST');
      }
      return new Response(JSON.stringify({
        jobs: [{
          title: 'Platform Engineer',
          company: 'Example Co',
          location: 'Remote',
          link: 'https://jooble.org/away/example',
          snippet: 'Recovered job listing',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      '[JoobleAPI] Rate limited (attempt 1/3) for keyword="kafka engineer" location="South Africa" page=1; retrying in 0s.',
    );
  });

  it('turns Jooble search HTML into a readable description', async () => {
    process.env.JOOBLE_API_KEY = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_MAX_PAGES = '1';
    process.env.JOOBLE_MAX_DETAIL_FETCHES = '0';
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

  it('enriches snippet-only Jooble jobs from detail-page metadata when available', async () => {
    process.env.JOOBLE_API_KEY = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_MAX_PAGES = '1';
    process.env.JOOBLE_MAX_DETAIL_FETCHES = '1';
    const detailUrl = `https://jooble.org/desc/example-role-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          jobs: [{
            title: 'Software Engineer (Frontend)',
            company: 'Latent',
            location: 'San Francisco, CA',
            link: detailUrl,
            snippet: '&nbsp;...will own the user interface and frontend architecture...&nbsp;',
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      expect(url).toBe(detailUrl);
      return new Response(
        '<html><head><meta name="description" content="Build and evolve the frontend platform for mission-critical healthcare workflows, including React architecture, AI-assisted tooling, and collaboration across product, design, and backend engineering."></head><body></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].description).toBe(
      'Build and evolve the frontend platform for mission-critical healthcare workflows, including React architecture, AI-assisted tooling, and collaboration across product, design, and backend engineering.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('captures the whole detailed description from Jooble HTML when it is present', async () => {
    process.env.JOOBLE_API_KEY = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_MAX_PAGES = '1';
    process.env.JOOBLE_MAX_DETAIL_FETCHES = '1';
    const detailUrl = `https://jooble.org/desc/full-description-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fullDescription = [
      'Build and scale the platform behind our AI-powered clinical operations workflow.',
      'You will design reliable APIs, improve data pipelines, and partner closely with product and operations teams to bring new features to production safely.',
      'This role blends systems design, observability, and thoughtful collaboration across engineering and healthcare stakeholders.',
    ].join(' ');

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          jobs: [{
            title: 'Senior Platform Engineer',
            company: 'Northstar Health',
            location: 'Remote',
            link: detailUrl,
            snippet: '&nbsp;...build the platform behind the product...&nbsp;',
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      expect(url).toBe(detailUrl);
      return new Response(
        `<html><head><meta name="description" content="${fullDescription}"></head><body></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].description).toBe(fullDescription);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the snippet when Jooble detail fetch is blocked', async () => {
    process.env.JOOBLE_API_KEY = `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    process.env.JOOBLE_MAX_PAGES = '1';
    process.env.JOOBLE_MAX_DETAIL_FETCHES = '1';
    const detailUrl = `https://jooble.org/desc/example-role-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          jobs: [{
            title: 'Software Engineer (Frontend)',
            company: 'Latent',
            location: 'San Francisco, CA',
            link: detailUrl,
            snippet: '&nbsp;...will own the user interface and frontend architecture for our core product...&nbsp;',
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(
        '<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const jobs = await fetchAllJoobleJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].description).toBe('will own the user interface and frontend architecture for our core product');
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
