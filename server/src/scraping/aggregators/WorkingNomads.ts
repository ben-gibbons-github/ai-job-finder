import { fetchAllWorkingNomadsJobs } from '../miscScrapers/WorkingNomadsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WorkingNomadsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWorkingNomadsJobs();
    } catch (error) {
      console.error('Error scraping Working Nomads jobs:', error);
      return [];
    }
  }
}