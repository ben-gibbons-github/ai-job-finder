import { fetchAllPharmiwebEngineerRssJobs } from './PharmiwebEngineerRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class PharmiwebEngineerRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllPharmiwebEngineerRssJobs();
    } catch (error) {
      console.error('Error scraping PharmiwebEngineerRSS:', error);
      return [];
    }
  }
}
