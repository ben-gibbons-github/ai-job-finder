import { fetchAll80KHoursJobs } from './EightyKHoursAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class EightyKHoursScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAll80KHoursJobs();
    } catch (error) {
      console.error('Error scraping 80kHours jobs:', error);
      return [];
    }
  }
}
