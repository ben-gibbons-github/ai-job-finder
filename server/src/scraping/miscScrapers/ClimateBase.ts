

import { ScrapedJob } from '../core/ScrapedJob.js';
import { fetchAllClimatebaseJobs } from './ClimateBaseAPI.js';

export default class ClimateBaseScraper {
    async scrapeJobs(): Promise<ScrapedJob[]> {
        try {
            return await fetchAllClimatebaseJobs();
        } catch (error) {
            console.error('Error scraping ClimateBase jobs:', error);
            return [];
        }
    }
}
