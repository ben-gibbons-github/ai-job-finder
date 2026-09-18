import { fetchAllRemoteOkDesignJobs } from './RemoteOKDesignAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKDesignScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkDesignJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKDesign jobs:', error);
      return [];
    }
  }
}
