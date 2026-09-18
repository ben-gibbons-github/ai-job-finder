import { fetchAllRemoteOkSalesJobs } from './RemoteOKSalesAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKSalesScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkSalesJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKSales jobs:', error);
      return [];
    }
  }
}
