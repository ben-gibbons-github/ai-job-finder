import { fetchAllGreenhouseJobs } from './GreenhouseAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class GreenhouseScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllGreenhouseJobs();
    } catch (error) {
      console.error('Error scraping Greenhouse jobs:', error);
      return [];
    }
  }
}
