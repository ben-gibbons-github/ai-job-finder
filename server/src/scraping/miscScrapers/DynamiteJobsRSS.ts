import { fetchAllDynamiteJobsRssJobs } from './DynamiteJobsRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class DynamiteJobsRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllDynamiteJobsRssJobs();
    } catch (error) {
      console.error('Error scraping DynamiteJobsRSS jobs:', error);
      return [];
    }
  }
}
