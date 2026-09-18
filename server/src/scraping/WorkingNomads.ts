import { fetchAllWorkingNomadsJobs } from './WorkingNomadsAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

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