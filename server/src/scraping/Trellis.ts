import { fetchAllTrellisJobs } from './TrellisAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class TrellisScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllTrellisJobs();
    } catch (error) {
      console.error('Error scraping Trellis jobs:', error);
      return [];
    }
  }
}
