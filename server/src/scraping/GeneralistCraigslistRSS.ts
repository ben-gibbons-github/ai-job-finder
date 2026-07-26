import { fetchAllGeneralistCraigslistRssJobs } from './GeneralistCraigslistRSSAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class GeneralistCraigslistRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllGeneralistCraigslistRssJobs();
    } catch (error) {
      console.error('Error scraping GeneralistCraigslistRSS jobs:', error);
      return [];
    }
  }
}
