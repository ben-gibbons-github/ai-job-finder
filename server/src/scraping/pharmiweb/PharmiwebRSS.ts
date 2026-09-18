import { fetchAllPharmiwebRssJobs } from './PharmiwebRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class PharmiwebRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllPharmiwebRssJobs();
    } catch (error) {
      console.error('Error scraping PharmiwebRSS:', error);
      return [];
    }
  }
}
