import { fetchAllRemoteOkDataJobs } from './RemoteOKDataAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKDataScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkDataJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKData jobs:', error);
      return [];
    }
  }
}
