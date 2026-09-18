import { fetchAllWeWorkRemotelyCopywritingJobs } from './WeWorkRemotelyCopywritingAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class WeWorkRemotelyCopywritingScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelyCopywritingJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelyCopywriting jobs:', error);
      return [];
    }
  }
}
