import { fetchAllEthicalJobs } from './EthicalJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class EthicalJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllEthicalJobs();
    } catch (error) {
      console.error('Error scraping EthicalJobs jobs:', error);
      return [];
    }
  }
}
