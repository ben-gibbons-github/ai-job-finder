import { fetchAllIdealistNonprofitJobs } from './IdealistNonprofitJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class IdealistNonprofitJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllIdealistNonprofitJobs();
    } catch (error) {
      console.error('Error scraping IdealistNonprofitJobs:', error);
      return [];
    }
  }
}
