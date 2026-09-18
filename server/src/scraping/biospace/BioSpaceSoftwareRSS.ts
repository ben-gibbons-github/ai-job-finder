import { fetchAllBioSpaceSoftwareRssJobs } from './BioSpaceSoftwareRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BioSpaceSoftwareRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBioSpaceSoftwareRssJobs();
    } catch (error) {
      console.error('Error scraping BioSpaceSoftwareRSS:', error);
      return [];
    }
  }
}
