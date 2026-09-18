import { fetchAllWorkingAmericaJobs } from './WorkingAmericaJobsAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class WorkingAmericaJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWorkingAmericaJobs();
    } catch (error) {
      console.error('Error scraping WorkingAmericaJobs:', error);
      return [];
    }
  }
}
