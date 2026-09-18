import { fetchAllArtJobs } from './ArtJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class ArtJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllArtJobs();
    } catch (error) {
      console.error('Error scraping ArtJobs:', error);
      return [];
    }
  }
}
