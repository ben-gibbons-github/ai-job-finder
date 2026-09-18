import { fetchAllJobicyRssJobs } from './JobicyRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class JobicyRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllJobicyRssJobs();
    } catch (error) {
      console.error('Error scraping JobicyRSS jobs:', error);
      return [];
    }
  }
}
