import { fetchAllRemoteOkJobs } from './RemoteOKAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkJobs();
    } catch (error) {
      console.error('Error scraping RemoteOK jobs:', error);
      return [];
    }
  }
}
