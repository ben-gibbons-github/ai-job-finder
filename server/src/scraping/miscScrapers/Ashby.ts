import { fetchAllAshbyJobs } from './AshbyAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class AshbyScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllAshbyJobs();
    } catch (error) {
      console.error('Error scraping Ashby jobs:', error);
      return [];
    }
  }
}
