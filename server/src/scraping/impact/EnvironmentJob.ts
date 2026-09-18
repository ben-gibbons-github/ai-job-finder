import { fetchAllEnvironmentJobs } from './EnvironmentJobAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class EnvironmentJobScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllEnvironmentJobs();
    } catch (error) {
      console.error('Error scraping EnvironmentJob jobs:', error);
      return [];
    }
  }
}
