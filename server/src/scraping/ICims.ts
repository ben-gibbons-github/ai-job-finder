import { fetchAllIcimsJobs } from './ICimsAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class ICimsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllIcimsJobs();
    } catch (error) {
      console.error('Error scraping iCIMS jobs:', error);
      return [];
    }
  }
}
