import { fetchAllRemoteOkLegalJobs } from './RemoteOKLegalAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKLegalScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkLegalJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKLegal jobs:', error);
      return [];
    }
  }
}
