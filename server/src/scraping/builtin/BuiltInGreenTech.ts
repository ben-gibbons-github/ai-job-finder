import { fetchAllBuiltInGreenTechJobs } from './BuiltInGreenTechAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BuiltInGreenTechScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBuiltInGreenTechJobs();
    } catch (error) {
      console.error('Error scraping BuiltInGreenTech:', error);
      return [];
    }
  }
}
