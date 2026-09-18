import { fetchAllDevNetJobsHighlighted } from '../miscScrapers/DevNetJobsHighlightedAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class DevNetJobsHighlightedScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllDevNetJobsHighlighted();
    } catch (error) {
      console.error('Error scraping DevNetJobsHighlighted jobs:', error);
      return [];
    }
  }
}
