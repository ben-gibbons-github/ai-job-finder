import { fetchAllBuiltInJobs } from './BuiltInAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BuiltInScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBuiltInJobs();
    } catch (error) {
      console.error('Error scraping BuiltIn jobs:', error);
      return [];
    }
  }
}