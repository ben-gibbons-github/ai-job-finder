import { fetchAllRemoteOkSupportJobs } from './RemoteOKSupportAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKSupportScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkSupportJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKSupport jobs:', error);
      return [];
    }
  }
}
