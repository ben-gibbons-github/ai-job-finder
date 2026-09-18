import { fetchAllRemoteOkMarketingJobs } from './RemoteOKMarketingAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKMarketingScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkMarketingJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKMarketing jobs:', error);
      return [];
    }
  }
}
