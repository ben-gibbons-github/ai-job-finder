const FETCH_TIMEOUT_MS = 30_000;
function toScrapedJob(source, job, lat, lon) {
    return {
        name: job.title || 'Unknown Role',
        company_name: job.company || 'Unknown Company',
        location: job.location || 'Remote',
        remote: job.remote || 'Unknown',
        location_lat: lat,
        location_lon: lon,
        description: job.description || '',
        type: job.type || 'Full-time',
        source,
        source_url: job.sourceUrl,
        posted: job.posted || new Date().toISOString(),
        impact_number: 0,
        audit_number: 0,
        audit_text: '',
        tags: Array.isArray(job.tags) ? job.tags.filter(Boolean) : []
    };
}
export function parseCsvEnv(value) {
    if (!value) {
        return [];
    }
    return value
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
}
export async function normalizeJobsWithCoordinates(source, jobs) {
    // Keep ingestion non-blocking: do not wait on network geocoding during scraping.
    // Missing coordinates are backfilled later by background geocoding.
    return jobs.map((job) => toScrapedJob(source, job, 0, 0));
}
export async function fetchJson(url) {
    const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': 'job-finder-super-scraper/1.0',
        },
    });
    if (!res.ok) {
        throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
    }
    return res.json();
}
