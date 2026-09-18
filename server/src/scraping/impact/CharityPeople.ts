import { fetchAllCharityPeopleJobs } from './CharityPeopleAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class CharityPeopleScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllCharityPeopleJobs();
    } catch (error) {
      console.error('Error scraping CharityPeople jobs:', error);
      return [];
    }
  }
}
