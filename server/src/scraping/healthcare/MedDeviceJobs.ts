import { fetchAllMedDeviceJobs } from './MedDeviceJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class MedDeviceJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllMedDeviceJobs();
    } catch (error) {
      console.error('Error scraping MedDeviceJobs:', error);
      return [];
    }
  }
}
