import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchAllClimateBaseV2Jobs } from './ClimateBaseV2API.js';

export default class ClimateBaseScraperV2 {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllClimateBaseV2Jobs();
    } catch (error) {
      console.error('Error scraping ClimateBase V2 jobs:', error);
      return [];
    }
  }
}