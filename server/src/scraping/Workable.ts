import { fetchAllWorkableJobs } from './WorkableAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class WorkableScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWorkableJobs();
    } catch (error) {
      console.error('Error scraping Workable jobs:', error);
      return [];
    }
  }
}
