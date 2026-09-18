import { fetchAllRemotiveJobs } from './RemotiveAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemotiveScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemotiveJobs();
    } catch (error) {
      console.error('Error scraping Remotive jobs:', error);
      return [];
    }
  }
}
