import { fetchAllRemoteOkOperationsJobs } from './RemoteOKOperationsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKOperationsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkOperationsJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKOperations jobs:', error);
      return [];
    }
  }
}
