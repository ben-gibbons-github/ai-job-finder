import { fetchAllRemoteCoRssJobs } from './RemoteCoRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteCoRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteCoRssJobs();
    } catch (error) {
      console.error('Error scraping RemoteCoRSS jobs:', error);
      return [];
    }
  }
}
