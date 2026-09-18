import { fetchAllWeWorkRemotelyCustomerSupportJobs } from './WeWorkRemotelyCustomerSupportAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WeWorkRemotelyCustomerSupportScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelyCustomerSupportJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelyCustomerSupport jobs:', error);
      return [];
    }
  }
}
