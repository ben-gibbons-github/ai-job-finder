import { fetchAllCharityJobs } from './CharityJobAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class CharityJobScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllCharityJobs();
    } catch (error) {
      console.error('Error scraping CharityJob jobs:', error);
      return [];
    }
  }
}
