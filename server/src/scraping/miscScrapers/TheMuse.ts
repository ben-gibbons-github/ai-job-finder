import { fetchAllTheMuseJobs } from './TheMuseAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class TheMuseScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllTheMuseJobs();
    } catch (error) {
      console.error('Error scraping The Muse jobs:', error);
      return [];
    }
  }
}
