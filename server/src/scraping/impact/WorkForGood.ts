import { fetchAllWorkForGoodJobs } from './WorkForGoodAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WorkForGoodScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWorkForGoodJobs();
    } catch (error) {
      console.error('Error scraping WorkForGood:', error);
      return [];
    }
  }
}
