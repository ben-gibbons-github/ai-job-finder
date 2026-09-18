import { fetchAllAccCareerCenterJobs } from './ACCCareerCenterAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class ACCCareerCenterScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllAccCareerCenterJobs();
    } catch (error) {
      console.error('Error scraping ACCCareerCenter:', error);
      return [];
    }
  }
}
