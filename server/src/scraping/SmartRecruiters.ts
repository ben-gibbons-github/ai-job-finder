import { fetchAllSmartRecruitersJobs } from './SmartRecruitersAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class SmartRecruitersScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllSmartRecruitersJobs();
    } catch (error) {
      console.error('Error scraping SmartRecruiters jobs:', error);
      return [];
    }
  }
}
