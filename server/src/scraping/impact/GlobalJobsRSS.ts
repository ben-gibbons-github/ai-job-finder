import { fetchAllGlobalJobsRss } from './GlobalJobsRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class GlobalJobsRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllGlobalJobsRss();
    } catch (error) {
      console.error('Error scraping GlobalJobsRSS jobs:', error);
      return [];
    }
  }
}
