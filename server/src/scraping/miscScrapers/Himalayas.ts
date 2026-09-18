import { fetchAllHimalayasJobs } from './HimalayasAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class HimalayasScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllHimalayasJobs();
    } catch (error) {
      console.error('Error scraping Himalayas jobs:', error);
      return [];
    }
  }
}