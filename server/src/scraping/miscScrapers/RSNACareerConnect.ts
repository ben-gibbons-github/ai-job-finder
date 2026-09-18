import { fetchAllRsnaCareerConnectJobs } from './RSNACareerConnectAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RSNACareerConnectScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRsnaCareerConnectJobs();
    } catch (error) {
      console.error('Error scraping RSNACareerConnect:', error);
      return [];
    }
  }
}
