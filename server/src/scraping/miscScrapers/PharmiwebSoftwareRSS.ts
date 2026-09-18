import { fetchAllPharmiwebSoftwareRssJobs } from './PharmiwebSoftwareRSSAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class PharmiwebSoftwareRssScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllPharmiwebSoftwareRssJobs();
    } catch (error) {
      console.error('Error scraping PharmiwebSoftwareRSS:', error);
      return [];
    }
  }
}
