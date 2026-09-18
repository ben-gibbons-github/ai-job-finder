import { fetchAllArtJobs } from './ArtJobsAPI.js';
export default class ArtJobsScraper {
    async scrapeJobs() {
        try {
            return await fetchAllArtJobs();
        }
        catch (error) {
            console.error('Error scraping ArtJobs:', error);
            return [];
        }
    }
}
