import { fetchAllRemoteOkProductJobs } from './RemoteOKProductAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKProductScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkProductJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKProduct jobs:', error);
      return [];
    }
  }
}
