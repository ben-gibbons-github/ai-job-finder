import { fetchAllMedicalJobs } from './MedicalJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class MedicalJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllMedicalJobs();
    } catch (error) {
      console.error('Error scraping MedicalJobs:', error);
      return [];
    }
  }
}
