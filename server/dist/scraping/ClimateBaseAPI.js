const CLIMATEBASE_JOBS_URL = 'https://climatebase.org/jobs';
const FETCH_TIMEOUT = 30000;
const ALGOLIA_BROWSE_ENDPOINT = 'https://8psnffqtxq-dsn.algolia.net/1/indexes/Job_production/browse';
const ALGOLIA_APP_ID = '8PSNFFQTXQ';
const ALGOLIA_API_KEY = process.env.CLIMATEBASE_ALGOLIA_API_KEY ?? '';
const ALGOLIA_BROWSE_HITS_PER_PAGE = 1000;
const MAX_BROWSE_REQUESTS = 500;
const CLIMATEBASE_FACET_FILTERS = [
    'active:true',
    'employer_has_approval:true',
    ['id:-29340874'],
    ['id:-46605467'],
    ['id:-47385433'],
    ['id:-47385435'],
];
const CLIMATEBASE_ATTRIBUTES_TO_RETRIEVE = [
    'id',
    'source',
    'recomm_id',
    'title',
    'name_of_employer',
    'locations',
    'job_types',
    'featured',
    'activation_date',
    'logo',
    'remote_preferences',
    'salary_from',
    'salary_to',
    'salary_period',
    'employer_name',
    'membership_status',
    'employer_membership_status',
    'employer_short_description',
    'sectors',
    'employer_id',
    'featured',
];
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x2F;/g, '/');
}
function extractJSONArrayByKey(html, key) {
    const marker = `"${key}":[`;
    const start = html.indexOf(marker);
    if (start === -1) {
        return [];
    }
    let i = start + marker.length - 1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    while (i < html.length) {
        const ch = html[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (ch === '\\') {
                escaped = true;
            }
            else if (ch === '"') {
                inString = false;
            }
            i++;
            continue;
        }
        if (ch === '"') {
            inString = true;
            i++;
            continue;
        }
        if (ch === '[') {
            depth++;
        }
        else if (ch === ']') {
            depth--;
            if (depth === 0) {
                const json = html.slice(start + marker.length - 1, i + 1);
                return JSON.parse(json);
            }
        }
        i++;
    }
    return [];
}
function normalizeJob(job) {
    const locations = Array.isArray(job.locations) ? job.locations : [];
    const jobTypes = Array.isArray(job.job_types) ? job.job_types : [];
    const sectors = Array.isArray(job.sectors) ? job.sectors : [];
    const remotePrefs = Array.isArray(job.remote_preferences) ? job.remote_preferences : [];
    const employerName = job.employer_name || job.name_of_employer || 'Unknown Company';
    const description = job.description || job.employer_short_description || '';
    // Determine remote status from remote_preferences
    const remoteStatus = remotePrefs.length > 0 ? remotePrefs.join(', ') : 'On-site';
    return {
        name: job.title,
        company_name: employerName,
        location: locations.length > 0 ? locations[0] : 'Remote',
        remote: remoteStatus,
        location_lat: 0,
        location_lon: 0,
        description: decodeHtmlEntities(description),
        type: jobTypes.length > 0 ? jobTypes[0] : 'Full-time',
        source: 'ClimateBase',
        source_url: `https://climatebase.org/job/${job.objectID}`,
        posted: job.activation_date,
        impact_number: 0,
        audit_number: 0,
        audit_text: '',
        tags: [...sectors, ...remotePrefs].filter((x) => Boolean(x))
    };
}
async function fetchEmbeddedJobsFromPage() {
    const res = await fetch(CLIMATEBASE_JOBS_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) {
        throw new Error(`Climatebase jobs page fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    return extractJSONArrayByKey(html, 'jobs');
}
async function fetchAllClimatebaseJobsRaw() {
    if (!ALGOLIA_API_KEY) {
        throw new Error('Missing CLIMATEBASE_ALGOLIA_API_KEY');
    }
    const deduped = new Map();
    let cursor;
    let requestCount = 0;
    while (requestCount < MAX_BROWSE_REQUESTS) {
        requestCount += 1;
        const res = await fetch(ALGOLIA_BROWSE_ENDPOINT, {
            method: 'POST',
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-algolia-application-id': ALGOLIA_APP_ID,
                'x-algolia-api-key': ALGOLIA_API_KEY,
                Referer: 'https://climatebase.org/',
            },
            body: JSON.stringify({
                query: '',
                hitsPerPage: ALGOLIA_BROWSE_HITS_PER_PAGE,
                filters: '',
                facetFilters: CLIMATEBASE_FACET_FILTERS,
                attributesToRetrieve: CLIMATEBASE_ATTRIBUTES_TO_RETRIEVE,
                ...(cursor ? { cursor } : {}),
            }),
        });
        if (!res.ok) {
            throw new Error(`Climatebase Algolia browse failed: ${res.status} ${res.statusText}`);
        }
        const page = (await res.json());
        for (const job of page.hits) {
            if (job?.objectID) {
                deduped.set(String(job.objectID), job);
            }
        }
        if (!page.cursor) {
            break;
        }
        cursor = page.cursor;
    }
    if (requestCount >= MAX_BROWSE_REQUESTS) {
        throw new Error('Climatebase browse exceeded safety limit before completion.');
    }
    return Array.from(deduped.values());
}
export async function fetchAllClimatebaseJobs() {
    let jobs = [];
    try {
        jobs = await fetchAllClimatebaseJobsRaw();
    }
    catch (err) {
        console.warn(`Climatebase Algolia pagination failed, using embedded payload fallback: ${String(err)}`);
        jobs = await fetchEmbeddedJobsFromPage();
    }
    if (jobs.length === 0) {
        console.warn('Climatebase payload contained no jobs.');
        return [];
    }
    // Keep ingestion non-blocking: do not wait on geocoding during scrape fetch.
    const normalized = jobs.map((job) => {
        const norm = normalizeJob(job);
        norm.location_lat = 0;
        norm.location_lon = 0;
        return norm;
    });
    return normalized;
}
