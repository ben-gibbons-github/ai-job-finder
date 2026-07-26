import { fetchAllUsaJobs } from './USAJobsAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class UsaJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllUsaJobs();
    } catch (error) {
      console.error('Error scraping USAJobs:', error);
      return [];
    }
  }
}
