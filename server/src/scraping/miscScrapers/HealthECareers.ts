import { fetchAllHealthECareersJobs } from './HealthECareersAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class HealthECareersScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllHealthECareersJobs();
    } catch (error) {
      console.error('Error scraping HealthECareers:', error);
      return [];
    }
  }
}
