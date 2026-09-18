import { fetchAllBreezyJobs } from './BreezyAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BreezyScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBreezyJobs();
    } catch (error) {
      console.error('Error scraping Breezy jobs:', error);
      return [];
    }
  }
}
