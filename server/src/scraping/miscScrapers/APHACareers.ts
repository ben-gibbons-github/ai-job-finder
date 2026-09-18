import { fetchAllAphaCareersJobs } from './APHACareersAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class APHACareersScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllAphaCareersJobs();
    } catch (error) {
      console.error('Error scraping APHACareers:', error);
      return [];
    }
  }
}
