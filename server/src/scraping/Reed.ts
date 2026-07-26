import { fetchAllReedJobs } from './ReedAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class ReedScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllReedJobs();
    } catch (error) {
      console.error('Error scraping Reed jobs:', error);
      return [];
    }
  }
}
