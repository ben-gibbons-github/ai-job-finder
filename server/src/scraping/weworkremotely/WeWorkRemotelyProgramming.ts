import { fetchAllWeWorkRemotelyProgrammingJobs } from './WeWorkRemotelyProgrammingAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class WeWorkRemotelyProgrammingScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllWeWorkRemotelyProgrammingJobs();
    } catch (error) {
      console.error('Error scraping WeWorkRemotelyProgramming jobs:', error);
      return [];
    }
  }
}