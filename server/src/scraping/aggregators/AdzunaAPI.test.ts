import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllAdzunaJobs } from './AdzunaAPI.js';

describe('fetchAllAdzunaJobs - Auth Failure Handling', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADZUNA_COUNTRIES = 'us';
    process.env.ADZUNA_MAX_KEYWORDS = '1';
    process.env.ADZUNA_MAX_PAGES = '2';
    process.env.ADZUNA_REQUEST_DELAY_MS = '0';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logs authorization failure and stops scrape when Adzuna returns auth failure JSON on fresh fetch', async () => {
    const runId = Math.random().toString(36).slice(2);
    process.env.ADZUNA_APP_ID = `test-app-${runId}`;
    process.env.ADZUNA_APP_KEY = `test-key-${runId}`;
    process.env.ADZUNA_KEYWORDS = `engineer-${runId}`;

    const authFailBody = JSON.stringify({
      __CLASS__: 'Adzuna::API::Response::Exception',
      display: 'Authorisation failed',
      exception: 'AUTH_FAIL',
      doc: 'https://api.adzuna.com/v1/doc',
    });

    const fetchMock = vi.fn(async () =>
      new Response(authFailBody, {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const jobs = await fetchAllAdzunaJobs();

    expect(jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[AdzunaAPI] Authorization failed (fresh page, country=us, keyword="engineer-${runId}", page=1): Authorisation failed`),
    );
  });

  it('logs authorization failure when loading from cached auth failure page', async () => {
    const runId = Math.random().toString(36).slice(2);
    process.env.ADZUNA_APP_ID = `test-app-${runId}`;
    process.env.ADZUNA_APP_KEY = `test-key-${runId}`;
    process.env.ADZUNA_KEYWORDS = `cached-auth-${runId}`;

    const authFailBody = JSON.stringify({
      __CLASS__: 'Adzuna::API::Response::Exception',
      display: 'Authorisation failed',
      exception: 'AUTH_FAIL',
      doc: 'https://api.adzuna.com/v1/doc',
    });

    const fetchMock = vi.fn(async () =>
      new Response(authFailBody, {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // 1st run: Populates cache
    await fetchAllAdzunaJobs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[AdzunaAPI] Authorization failed (fresh page, country=us, keyword="cached-auth-${runId}", page=1): Authorisation failed`),
    );

    warnSpy.mockClear();

    // 2nd run: Loads from cache
    const cachedJobs = await fetchAllAdzunaJobs();
    expect(cachedJobs).toEqual([]);
    // Global fetch was not called again because it was served from cache
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[AdzunaAPI] Authorization failed (cached page, country=us, keyword="cached-auth-${runId}", page=1): Authorisation failed`),
    );
  });

  it('logs authorization failure when Adzuna returns auth failure in 200 OK response', async () => {
    const runId = Math.random().toString(36).slice(2);
    process.env.ADZUNA_APP_ID = `test-app-${runId}`;
    process.env.ADZUNA_APP_KEY = `test-key-${runId}`;
    process.env.ADZUNA_KEYWORDS = `auth-200-${runId}`;

    const authFailBody = JSON.stringify({
      __CLASS__: 'Adzuna::API::Response::Exception',
      display: 'Authorisation failed',
      exception: 'AUTH_FAIL',
      doc: 'https://api.adzuna.com/v1/doc',
    });

    const fetchMock = vi.fn(async () =>
      new Response(authFailBody, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const jobs = await fetchAllAdzunaJobs();

    expect(jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[AdzunaAPI] Authorization failed (fresh page, country=us, keyword="auth-200-${runId}", page=1): Authorisation failed`),
    );
  });
});
