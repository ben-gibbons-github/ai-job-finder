import { fetchAllPharmiwebDataRssJobs } from './PharmiwebDataRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class PharmiwebDataRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllPharmiwebDataRssJobs();
    } catch (error) {
      console.error('Error scraping PharmiwebDataRSS:', error);
      return [];
    }
  }
}
