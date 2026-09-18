import { fetchAllBuiltInSocialImpactJobs } from './BuiltInSocialImpactAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class BuiltInSocialImpactScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllBuiltInSocialImpactJobs();
    } catch (error) {
      console.error('Error scraping BuiltInSocialImpact:', error);
      return [];
    }
  }
}
