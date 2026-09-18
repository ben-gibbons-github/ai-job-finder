import { fetchAllBuiltInHealthTechJobs } from './BuiltInHealthTechAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BuiltInHealthTechScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBuiltInHealthTechJobs();
    } catch (error) {
      console.error('Error scraping BuiltInHealthTech:', error);
      return [];
    }
  }
}
