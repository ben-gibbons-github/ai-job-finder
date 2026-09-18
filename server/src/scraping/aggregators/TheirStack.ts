import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchAllTheirStackJobs } from './TheirStackAPI.js';

export default class TheirStackScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllTheirStackJobs();
    } catch (error) {
      console.error('Error scraping TheirStack jobs:', error);
      return [];
    }
  }
}