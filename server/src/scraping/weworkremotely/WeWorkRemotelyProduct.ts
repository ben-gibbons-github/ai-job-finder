import { fetchAllWeWorkRemotelyProductJobs } from './WeWorkRemotelyProductAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WeWorkRemotelyProductScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelyProductJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelyProduct jobs:', error);
      return [];
    }
  }
}
