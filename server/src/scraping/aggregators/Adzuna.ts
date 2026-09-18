import { fetchAllAdzunaJobs } from './AdzunaAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class AdzunaScraper {
  async scrapeJobs(onPageJobs?: (jobs: ScrapedJob[]) => Promise<void>): Promise<ScrapedJob[]> {
    try {
      return await fetchAllAdzunaJobs(onPageJobs);
    } catch (error) {
      console.error('Error scraping Adzuna jobs:', error);
      return [];
    }
  }
}
