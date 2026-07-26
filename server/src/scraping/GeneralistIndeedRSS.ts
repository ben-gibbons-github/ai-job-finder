import { fetchAllGeneralistIndeedRssJobs } from './GeneralistIndeedRSSAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class GeneralistIndeedRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllGeneralistIndeedRssJobs();
    } catch (error) {
      console.error('Error scraping GeneralistIndeedRSS jobs:', error);
      return [];
    }
  }
}
