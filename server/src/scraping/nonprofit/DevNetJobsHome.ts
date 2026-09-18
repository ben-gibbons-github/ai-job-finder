import { fetchAllDevNetJobsHome } from '../miscScrapers/DevNetJobsHomeAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class DevNetJobsHomeScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllDevNetJobsHome();
    } catch (error) {
      console.error('Error scraping DevNetJobsHome jobs:', error);
      return [];
    }
  }
}
