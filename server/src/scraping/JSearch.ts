import { fetchAllJSearchJobs } from './JSearchAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class JSearchScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllJSearchJobs();
    } catch (error) {
      console.error('Error scraping JSearch jobs:', error);
      return [];
    }
  }
}
