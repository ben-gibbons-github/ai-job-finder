import { fetchAllBioSpaceDataRssJobs } from './BioSpaceDataRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BioSpaceDataRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBioSpaceDataRssJobs();
    } catch (error) {
      console.error('Error scraping BioSpaceDataRSS:', error);
      return [];
    }
  }
}
