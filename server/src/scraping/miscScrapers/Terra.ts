import { fetchAllTerraJobs } from './TerraAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class TerraScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllTerraJobs();
    } catch (error) {
      console.error('Error scraping Terra jobs:', error);
      return [];
    }
  }
}
