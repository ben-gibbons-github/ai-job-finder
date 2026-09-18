import { fetchAllImpactPoolJobs } from './ImpactPoolAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class ImpactPoolScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllImpactPoolJobs();
    } catch (error) {
      console.error('Error scraping ImpactPool jobs:', error);
      return [];
    }
  }
}
