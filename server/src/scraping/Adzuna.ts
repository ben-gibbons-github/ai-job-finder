import { fetchAllAdzunaJobs } from './AdzunaAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class AdzunaScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllAdzunaJobs();
    } catch (error) {
      console.error('Error scraping Adzuna jobs:', error);
      return [];
    }
  }
}
