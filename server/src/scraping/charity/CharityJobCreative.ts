import { fetchAllCharityJobCreativeJobs } from './CharityJobCreativeAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class CharityJobCreativeScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllCharityJobCreativeJobs();
    } catch (error) {
      console.error('Error scraping CharityJobCreative jobs:', error);
      return [];
    }
  }
}
