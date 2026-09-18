import { fetchAllJmirCareersJobs } from './JMIRCareersAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class JMIRCareersScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllJmirCareersJobs();
    } catch (error) {
      console.error('Error scraping JMIRCareers:', error);
      return [];
    }
  }
}
