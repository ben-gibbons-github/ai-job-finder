import ClimateBaseScraper from '../aggregators/ClimateBase.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScrapedJob } from './ScrapedJob.js';
import { fetchAllClimatebaseJobs } from '../miscScrapers/ClimateBaseAPI.js';

vi.mock('../miscScrapers/ClimateBaseAPI.js', () => ({
  fetchAllClimatebaseJobs: vi.fn(),
}));

const fetchAllClimatebaseJobsMock = vi.mocked(fetchAllClimatebaseJobs);

describe('ClimateBaseScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return jobs from ClimateBase API', async () => {
    const scraper = new ClimateBaseScraper();
    const mockedJobs: ScrapedJob[] = [
      {
        name: 'Senior Software Engineer',
        company_name: 'GreenTech Inc',
        location: 'San Francisco, CA',
        remote: 'Remote',
        location_lon: -122.4194,
        location_lat: 37.7749,
        description: 'Lead our sustainability initiatives',
        type: 'Full-time',
        source: 'ClimateBase',
        source_url: 'https://climatebase.org/job/123',
        posted: '2024-05-10T00:00:00Z',
        impact_number: 0,
        audit_number: 0,
        audit_text: '',
        tags: ['Climate Tech', 'Remote'],
      },
    ];

    fetchAllClimatebaseJobsMock.mockResolvedValueOnce(mockedJobs);

    await expect(scraper.scrapeJobs()).resolves.toEqual(mockedJobs);
    expect(fetchAllClimatebaseJobsMock).toHaveBeenCalledTimes(1);
  });

  it('should return empty array when API throws', async () => {
    const scraper = new ClimateBaseScraper();
    fetchAllClimatebaseJobsMock.mockRejectedValueOnce(new Error('upstream failed'));

    await expect(scraper.scrapeJobs()).resolves.toEqual([]);
    expect(fetchAllClimatebaseJobsMock).toHaveBeenCalledTimes(1);
  });
});
