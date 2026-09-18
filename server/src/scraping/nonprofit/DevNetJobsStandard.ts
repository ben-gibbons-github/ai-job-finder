import { fetchAllDevNetJobsStandard } from '../miscScrapers/DevNetJobsStandardAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class DevNetJobsStandardScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllDevNetJobsStandard();
    } catch (error) {
      console.error('Error scraping DevNetJobsStandard jobs:', error);
      return [];
    }
  }
}
