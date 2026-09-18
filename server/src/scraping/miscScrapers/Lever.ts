import { fetchAllLeverJobs } from './LeverAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class LeverScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllLeverJobs();
    } catch (error) {
      console.error('Error scraping Lever jobs:', error);
      return [];
    }
  }
}
