import { fetchAllBioSpaceRssJobs } from './BioSpaceRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BioSpaceRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBioSpaceRssJobs();
    } catch (error) {
      console.error('Error scraping BioSpaceRSS:', error);
      return [];
    }
  }
}
