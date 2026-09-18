/**
 * Job freshness scoring functionality
 * Calculates how recent a job posting is to help with ranking
 */
/** Cached version — pass the ScrapedJob to get O(1) repeated lookups within the same day. */
export function getJobFreshnessScore(job) {
    if (typeof job.freshness_number === 'number' && Number.isFinite(job.freshness_number)) {
        return job.freshness_number;
    }
    const score = calculateFreshnessScore(job.posted);
    job.freshness_number = score;
    return score;
}
/**
 * Calculates a freshness score based on how recently a job was posted
 * Score ranges from 0 to 1, with newer jobs getting higher scores
 *
 * Scoring curve:
 * - 0 days: 1.0 (fresh)
 * - 7 days: 0.8
 * - 30 days: 0.4
 * - 90+ days: 0.15 (old)
 *
 * Freshness score is intentionally compressed so it helps ranking without dominating it.
 *
 * @param posted - The posting date as a string or Date object
 * @returns A score between 0 and 1
 */
export function calculateFreshnessScore(posted, shouldLog = false) {
    try {
        const postedDate = typeof posted === 'string' ? new Date(posted) : posted;
        if (isNaN(postedDate.getTime())) {
            if (shouldLog) {
                console.log('Freshness scoring received invalid date, defaulting to 0.5:', posted);
            }
            return 0.5; // Default to middle score if date is invalid
        }
        const now = new Date();
        const daysSincePosted = (now.getTime() - postedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (shouldLog) {
            console.log('Freshness scoring days since posted:', daysSincePosted);
        }
        // Scoring curve: newer jobs get higher scores, but with softer spread.
        // 0 days: 1.0, 7 days: 0.8, 30 days: 0.4, 90+ days: 0.15
        if (daysSincePosted < 1)
            return 1.0;
        if (daysSincePosted < 30)
            return 1.0 - daysSincePosted * (0.2 / 30);
        if (daysSincePosted < 90)
            return 0.8 - (daysSincePosted - 30) * (0.4 / 60);
        if (daysSincePosted < 720)
            return 0.4 - (daysSincePosted - 90) * (0.25 / 630);
        return 0.15;
    }
    catch (e) {
        if (shouldLog) {
            console.log('Freshness scoring failed, defaulting to 0.5:', e);
        }
        return 0.5; // Default to middle score on error
    }
}
