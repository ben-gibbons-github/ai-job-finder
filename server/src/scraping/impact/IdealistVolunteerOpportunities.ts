import { fetchAllIdealistVolunteerOpportunities } from './IdealistVolunteerOpportunitiesAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class IdealistVolunteerOpportunitiesScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllIdealistVolunteerOpportunities();
    } catch (error) {
      console.error('Error scraping IdealistVolunteerOpportunities:', error);
      return [];
    }
  }
}
