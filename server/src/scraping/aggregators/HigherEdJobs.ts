import { fetchAllHigherEdJobs } from '../miscScrapers/HigherEdJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class HigherEdJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllHigherEdJobs();
    } catch (error) {
      console.error('Error scraping HigherEdJobs:', error);
      return [];
    }
  }
}
