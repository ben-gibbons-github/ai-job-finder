import { fetchAllCharityVolunteerJobs } from './CharityVolunteerJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class CharityVolunteerJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllCharityVolunteerJobs();
    } catch (error) {
      console.error('Error scraping CharityVolunteerJobs:', error);
      return [];
    }
  }
}
