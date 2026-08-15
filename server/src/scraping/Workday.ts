import { fetchAllWorkdayJobs } from './WorkdayAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class WorkdayScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWorkdayJobs();
    } catch (error) {
      console.error('Error scraping Workday jobs:', error);
      return [];
    }
  }
}
