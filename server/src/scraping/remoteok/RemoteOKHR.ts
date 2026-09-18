import { fetchAllRemoteOkHrJobs } from './RemoteOKHRAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKHRScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkHrJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKHR jobs:', error);
      return [];
    }
  }
}
