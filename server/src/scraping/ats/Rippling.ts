import type { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchAllRipplingJobs } from './RipplingAPI.js';

export default class RipplingScraper {
  async scrapeJobs(): Promise<ScrapedJob[]> {
    return fetchAllRipplingJobs();
  }
}