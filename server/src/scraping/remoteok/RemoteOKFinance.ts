import { fetchAllRemoteOkFinanceJobs } from './RemoteOKFinanceAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKFinanceScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkFinanceJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKFinance jobs:', error);
      return [];
    }
  }
}
