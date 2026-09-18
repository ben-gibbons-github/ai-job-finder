import { fetchAllBambooJobs } from './BambooAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BambooScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBambooJobs();
    } catch (error) {
      console.error('Error scraping Bamboo jobs:', error);
      return [];
    }
  }
}
