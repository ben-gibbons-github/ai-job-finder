import { fetchAllRemoteOkDeveloperJobs } from './RemoteOKDeveloperAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKDeveloperScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkDeveloperJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKDeveloper jobs:', error);
      return [];
    }
  }
}
