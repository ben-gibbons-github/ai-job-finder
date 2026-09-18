import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchAllPersonioJobs } from './PersonioAPI.js';

export default class PersonioScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllPersonioJobs();
    } catch (error) {
      console.error('Error scraping Personio jobs:', error);
      return [];
    }
  }
}