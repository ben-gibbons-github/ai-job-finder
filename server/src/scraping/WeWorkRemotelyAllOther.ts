import { fetchAllWeWorkRemotelyAllOtherJobs } from './WeWorkRemotelyAllOtherAPI.js';
import type { ScrapedJob } from './ScrapedJob.js';

export default class WeWorkRemotelyAllOtherScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelyAllOtherJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelyAllOther jobs:', error);
      return [];
    }
  }
}
