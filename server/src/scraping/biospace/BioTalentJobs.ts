import { fetchAllBioTalentJobs } from './BioTalentJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BioTalentJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBioTalentJobs();
    } catch (error) {
      console.error('Error scraping BioTalentJobs:', error);
      return [];
    }
  }
}
