import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScrapedJob } from './ScrapedJob.js';
import { loadComponentJobs, mergeJobsForCache } from './ScrapeJobCacheNeedUpdating.js';
import { readAnyCache, readFreshCache, writeCache } from './ScrapingCache.js';

vi.mock('./ScrapingCache.js', () => ({
  readAnyCache: vi.fn(),
  readFreshCache: vi.fn(),
  writeCache: vi.fn(),
}));

const readAnyCacheMock = vi.mocked(readAnyCache);
const readFreshCacheMock = vi.mocked(readFreshCache);
const writeCacheMock = vi.mocked(writeCache);

function makeJob(sourceUrl: string, description: string): ScrapedJob {
  return {
    name: 'Software Engineer',
    company_name: 'Acme',
    location: 'Remote',
    remote: 'Remote',
    location_lon: 0,
    location_lat: 0,
    description,
    type: 'Full-time',
    source: 'ExampleSource',
    source_url: sourceUrl,
    posted: '2026-01-01',
    impact_number: 0,
    audit_number: 0,
    audit_text: '',
    tags: [],
  };
}

describe('mergeJobsForCache', () => {
  it('keeps union of scraped and cached jobs', () => {
    const scraped = [makeJob('https://example.com/jobs/new', 'fresh')];
    const cached = [makeJob('https://example.com/jobs/old', 'stale')];

    const merged = mergeJobsForCache(scraped, cached);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((job) => job.source_url))).toEqual(
      new Set(['https://example.com/jobs/new', 'https://example.com/jobs/old']),
    );
  });

  it('prefers scraped job when both sides have same key', () => {
    const scraped = [makeJob('https://example.com/jobs/123', 'fresh description')];
    const cached = [makeJob('https://example.com/jobs/123', 'stale description')];

    const merged = mergeJobsForCache(scraped, cached);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.description).toBe('fresh description');
  });
});

describe('loadComponentJobs stale cache refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes merged jobs when refreshing from source after stale cache miss', async () => {
    const scraped = [makeJob('https://example.com/jobs/fresh', 'fresh')];
    const cached = [makeJob('https://example.com/jobs/stale', 'stale')];

    readFreshCacheMock.mockResolvedValueOnce(null);
    readAnyCacheMock.mockResolvedValueOnce(cached);

    const component = {
      name: 'ExampleSource',
      scrapeJobs: vi.fn().mockResolvedValue(scraped),
    };

    const result = await loadComponentJobs(component, { scrapingEnabled: true });

    expect(writeCacheMock).toHaveBeenCalledTimes(1);
    const writtenJobs = writeCacheMock.mock.calls[0]?.[1] ?? [];
    expect(new Set(writtenJobs.map((job) => job.source_url))).toEqual(
      new Set(['https://example.com/jobs/fresh', 'https://example.com/jobs/stale']),
    );

    expect(result.refreshedFromSource).toBe(true);
    expect(new Set(result.jobs.map((job) => job.source_url))).toEqual(
      new Set(['https://example.com/jobs/fresh', 'https://example.com/jobs/stale']),
    );
  });
});
