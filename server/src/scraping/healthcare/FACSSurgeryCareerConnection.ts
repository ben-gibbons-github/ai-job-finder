import { fetchAllFacsSurgeryCareerJobs } from './FACSSurgeryCareerConnectionAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class FACSSurgeryCareerConnectionScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllFacsSurgeryCareerJobs();
    } catch (error) {
      console.error('Error scraping FACSSurgeryCareerConnection:', error);
      return [];
    }
  }
}
