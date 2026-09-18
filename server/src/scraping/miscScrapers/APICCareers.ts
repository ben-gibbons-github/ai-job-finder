import { fetchAllApicCareersJobs } from './APICCareersAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class APICCareersScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllApicCareersJobs();
    } catch (error) {
      console.error('Error scraping APICCareers:', error);
      return [];
    }
  }
}
