import { fetchAllArtsJobs } from './ArtsJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class ArtsJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllArtsJobs();
    } catch (error) {
      console.error('Error scraping ArtsJobs:', error);
      return [];
    }
  }
}
