import { fetchAllCharityVillageJobs } from './CharityVillageAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class CharityVillageScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllCharityVillageJobs();
    } catch (error) {
      console.error('Error scraping CharityVillage jobs:', error);
      return [];
    }
  }
}
