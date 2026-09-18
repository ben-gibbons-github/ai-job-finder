import { fetchAllMuseumJobs } from '../miscScrapers/MuseumAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class MuseumScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllMuseumJobs();
    } catch (error) {
      console.error('Error scraping Museum jobs:', error);
      return [];
    }
  }
}
