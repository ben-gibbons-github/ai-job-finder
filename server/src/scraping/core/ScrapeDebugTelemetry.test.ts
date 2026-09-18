import { describe, expect, it } from 'vitest';

import {
  buildScrapeLoadDebugStats,
  recordPageJobCount,
  resetScrapeDebugTelemetry,
} from './ScrapeDebugTelemetry.js';

describe('scrape debug telemetry', () => {
  it('tracks jobs found per page for a scraper source', () => {
    resetScrapeDebugTelemetry();
    recordPageJobCount({ sourceName: 'Terra', query: 'software engineer', page: 1, jobsFound: 24 });
    recordPageJobCount({ sourceName: 'Terra', query: 'software engineer', page: 2, jobsFound: 18 });

    const stats = buildScrapeLoadDebugStats([]);
    expect(stats.pageJobCounts).toEqual([
      {
        label: 'Terra',
        query: 'software engineer',
        page: 1,
        jobsFound: 24,
      },
      {
        label: 'Terra',
        query: 'software engineer',
        page: 2,
        jobsFound: 18,
      },
    ]);
  });
});
