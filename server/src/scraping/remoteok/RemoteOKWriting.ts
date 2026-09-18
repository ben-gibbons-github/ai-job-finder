import { fetchAllRemoteOkWritingJobs } from './RemoteOKWritingAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKWritingScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkWritingJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKWriting jobs:', error);
      return [];
    }
  }
}
