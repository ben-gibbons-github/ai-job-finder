import { fetchAllAshpCareerPharmJobs } from './ASHPCareerPharmAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class ASHPCareerPharmScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllAshpCareerPharmJobs();
    } catch (error) {
      console.error('Error scraping ASHPCareerPharm:', error);
      return [];
    }
  }
}
