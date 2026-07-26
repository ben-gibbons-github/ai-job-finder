import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';
const DEFAULT_LEVER_BOARDS = [
    'palantir',
    'anduril',
    'calendly',
    'figma',
    'gusto',
    'improbable',
    'mixpanel',
    'postman',
    'procore',
    'rippling',
    'scaleai',
    'seekout',
    'thoughtspot',
    'udemy',
    'wealthfront',
    'ziprecruiter',
    'vanta',
    'amplitude',
    'netlify',
    'coinbase',
    'brex',
    'attentive',
    'checkr',
    'benchling',
    'klarna',
    'headway',
    'mavenclinic',
    'notion',
    'opendoor',
    'samsara',
    'snyk',
    'tripactions',
    'reddit',
    'robinhood',
    'squarespace',
    'discord',
    'figma',
    'doordash',
    'ramp',
    'scale',
    'afresh',
    'thousandeyes',
    'udacity',
    'zapier',
    'zipline',
    'whatnot',
    'openai',
    'notco',
];
function parseLeverPosting(board, posting) {
    return {
        title: posting.text || 'Unknown Role',
        company: board,
        location: posting.categories?.location || 'Remote',
        remote: 'Unknown',
        type: posting.categories?.commitment || 'Full-time',
        sourceUrl: posting.hostedUrl || `https://jobs.lever.co/${board}`,
        posted: posting.createdAt ? new Date(posting.createdAt).toISOString() : undefined,
        description: posting.descriptionPlain || '',
        tags: posting.categories?.team ? [posting.categories.team] : [],
    };
}
export async function fetchAllLeverJobs() {
    const envBoards = parseCsvEnv(process.env.LEVER_BOARDS);
    const boards = Array.from(new Set(envBoards.length > 0 ? envBoards : DEFAULT_LEVER_BOARDS));
    const normalized = [];
    for (const board of boards) {
        try {
            const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`;
            const payload = (await fetchJson(url));
            const jobs = Array.isArray(payload) ? payload : [];
            normalized.push(...jobs.map((job) => parseLeverPosting(board, job)));
        }
        catch (error) {
            console.warn(`[LeverAPI] Failed board ${board}:`, String(error));
        }
    }
    const direct = await normalizeJobsWithCoordinates('Lever', normalized);
    if (direct.length > 0) {
        return direct;
    }
    return fetchPortalFallbackJobs('Lever', (url) => /lever\.co/i.test(url));
}
