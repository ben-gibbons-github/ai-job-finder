import { fetchAllJoobleJobs } from './JoobleAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class JoobleScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllJoobleJobs();
    } catch (error) {
      console.error('Error scraping Jooble jobs:', error);
      return [];
    }
  }
}
