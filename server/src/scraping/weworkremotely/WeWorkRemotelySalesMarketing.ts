import { fetchAllWeWorkRemotelySalesMarketingJobs } from './WeWorkRemotelySalesMarketingAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WeWorkRemotelySalesMarketingScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelySalesMarketingJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelySalesMarketing jobs:', error);
      return [];
    }
  }
}
