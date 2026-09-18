import { fetchAllGetOnBoardJobs } from './GetOnBoardAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class GetOnBoardScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllGetOnBoardJobs();
    } catch (error) {
      console.error('Error scraping GetOnBoard jobs:', error);
      return [];
    }
  }
}
