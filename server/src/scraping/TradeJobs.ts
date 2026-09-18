import { fetchAllTradeJobs } from './TradeJobsAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class TradeJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllTradeJobs();
    } catch (error) {
      console.error('Error scraping TradeJobs:', error);
      return [];
    }
  }
}
