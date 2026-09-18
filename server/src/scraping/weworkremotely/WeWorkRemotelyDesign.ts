import { fetchAllWeWorkRemotelyDesignJobs } from './WeWorkRemotelyDesignAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WeWorkRemotelyDesignScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelyDesignJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelyDesign jobs:', error);
      return [];
    }
  }
}
