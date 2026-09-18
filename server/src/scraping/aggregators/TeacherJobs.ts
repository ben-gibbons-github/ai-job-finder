import { fetchAllTeacherJobs } from '../miscScrapers/TeacherJobsAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class TeacherJobsScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllTeacherJobs();
    } catch (error) {
      console.error('Error scraping TeacherJobs:', error);
      return [];
    }
  }
}
