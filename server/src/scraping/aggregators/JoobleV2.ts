import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchAllJoobleV2Jobs } from './JoobleV2API.js';

export default class JoobleV2Scraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllJoobleV2Jobs();
    } catch (error) {
      console.error('Error scraping Jooble V2 jobs:', error);
      return [];
    }
  }
}