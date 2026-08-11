import { fetchAllLinkedInJobs } from './LinkedInJobsAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class LinkedInJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllLinkedInJobs();
    } catch (error) {
      console.error('Error scraping LinkedIn jobs:', error);
      return [];
    }
  }
}
