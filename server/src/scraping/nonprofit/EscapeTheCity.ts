import { fetchAllEscapeTheCityJobs } from '../miscScrapers/EscapeTheCityAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class EscapeTheCityScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllEscapeTheCityJobs();
    } catch (error) {
      console.error('Error scraping EscapeTheCity jobs:', error);
      return [];
    }
  }
}
