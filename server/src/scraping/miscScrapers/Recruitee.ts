import { fetchAllRecruiteeJobs } from './RecruiteeAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RecruiteeScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRecruiteeJobs();
    } catch (error) {
      console.error('Error scraping Recruitee jobs:', error);
      return [];
    }
  }
}