import { fetchAllGlobalJobs } from './GlobalJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class GlobalJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllGlobalJobs();
    } catch (error) {
      console.error('Error scraping GlobalJobs jobs:', error);
      return [];
    }
  }
}
