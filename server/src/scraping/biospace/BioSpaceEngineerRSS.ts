import { fetchAllBioSpaceEngineerRssJobs } from './BioSpaceEngineerRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BioSpaceEngineerRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBioSpaceEngineerRssJobs();
    } catch (error) {
      console.error('Error scraping BioSpaceEngineerRSS:', error);
      return [];
    }
  }
}
