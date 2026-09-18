import { fetchAllJobForGoodJobs } from './JobForGoodAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class JobForGoodScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllJobForGoodJobs();
    } catch (error) {
      console.error('Error scraping JobForGood jobs:', error);
      return [];
    }
  }
}
