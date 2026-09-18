import { fetchAllImpactOpportunityJobs } from './ImpactOpportunityAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class ImpactOpportunityScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllImpactOpportunityJobs();
    } catch (error) {
      console.error('Error scraping ImpactOpportunity jobs:', error);
      return [];
    }
  }
}
