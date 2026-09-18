import { fetchAllTechJobsForGoodJobs } from './TechJobsForGoodAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class TechJobsForGoodScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllTechJobsForGoodJobs();
    } catch (error) {
      console.error('Error scraping TechJobsForGood jobs:', error);
      return [];
    }
  }
}
