import { fetchAllWeWorkRemotelyBusinessManagementJobs } from './WeWorkRemotelyBusinessManagementAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WeWorkRemotelyBusinessManagementScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelyBusinessManagementJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelyBusinessManagement jobs:', error);
      return [];
    }
  }
}
