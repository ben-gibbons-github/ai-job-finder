import { fetchAllRemoteOkEducationJobs } from './RemoteOKEducationAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class RemoteOKEducationScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllRemoteOkEducationJobs();
    } catch (error) {
      console.error('Error scraping RemoteOKEducation jobs:', error);
      return [];
    }
  }
}
