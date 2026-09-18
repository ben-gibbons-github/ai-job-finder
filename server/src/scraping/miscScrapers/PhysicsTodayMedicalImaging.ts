import { fetchAllPhysicsTodayMedicalImagingJobs } from './PhysicsTodayMedicalImagingAPI.js';
import type { ScrapedJob } from '../core/ScrapedJob.js';

export default class PhysicsTodayMedicalImagingScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    try {
      return await fetchAllPhysicsTodayMedicalImagingJobs();
    } catch (error) {
      console.error('Error scraping PhysicsTodayMedicalImaging:', error);
      return [];
    }
  }
}
