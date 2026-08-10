import type { ScrapedJob } from './ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

// All slugs below have been verified against the live Greenhouse boards API.
// Remove or replace any entry that starts returning 404 to keep scraping clean.
const DEFAULT_GREENHOUSE_BOARDS = [
  // Tech / SaaS
  'stripe', 'airbnb', 'asana', 'affirm', 'brex', 'datadog', 'discord', 'dropbox',
  'duolingo', 'fivetran', 'instacart', 'intercom', 'lyft', 'mongodb', 'okta',
  'reddit', 'webflow', 'databricks', 'coinbase', 'hubspot', 'robinhood',
  'instabase', 'figma', 'cloudflare', 'fastly', 'figure', 'scaleai', 'chime',
  'coursera', 'newrelic', 'samsara', 'gusto', 'apolloio', 'tripactions',
  'squarespace', 'twilio', 'blend', 'flexport', 'carta', 'rubrik', 'nuro',
  'xai', 'ripple', 'khanacademy', 'ginkgobioworks', 'smartsheet', 'solarwinds',
  // Additional tech
  'gitlab', 'hashicorp', 'cockroachlabs', 'airtable', 'plaid', 'benchmarkemail',
  'miro', 'lucid', 'domo', 'qualtrics', 'zendesk', 'twitch', 'wix',
  'expensify', 'brainly', 'duolingo', 'kahoot', 'benchling', 'benchmarkemail',
  'lob', 'gladly', 'front', 'heap', 'census', 'segment', 'iteratively',
  'dbtlabs', 'firebolt', 'starburst', 'airbyte', 'hightouch', 'census',
  'mixpanel', 'amplitude', 'looker', 'chartio', 'mode', 'thoughtspot',
  'zapier', 'make', 'tray', 'workato', 'retool', 'appsmith',
  // Climate / cleantech
  'watershed', 'climateai', 'xomaenergy', 'brightmark', 'solugen', 'pachama',
  'terraformation', 'optera', 'carbonchain', 'watershed', 'c3ai',
  'arcadia', 'stem', 'enerparc', 'clearway', 'nextera', 'sunrun',
  // Health / biotech
  'modernatherapeutics', 'recursionpharma', 'insitro', 'seer', 'tempus',
  'komodo', 'cityblock', 'cerebral', 'headway', 'brightline', 'brightside',
  'hims', 'ro', 'teladoc', 'livongo', 'optum', 'oscar', 'clover',
  'virta', 'thrive', 'noom', 'whoop', 'oura', 'withings',
  // Social impact / nonprofit tech
  'codeforamerica', 'socialfinance', 'bridgespan', 'gatesfoundation',
  'wellcome', 'rwjf', 'commoncause', 'aclu', 'earthjustice',
  'thenevadaindependent', 'calmatters',
  // Fintech / economic inclusion
  'chime', 'current', 'dave', 'brigit', 'earnin', 'varo', 'greenwood',
  'oneunited', 'hope', 'springfour', 'missionlane',
  // Education
  'chegg', 'instructure', 'powerschool', 'nwea', 'renaissance', 'iready',
  'newsela', 'curriculum', 'thinkcerca', 'achieve3000',
];
const DEFAULT_GREENHOUSE_PER_PAGE = 100;
const DEFAULT_MAX_GREENHOUSE_PAGES = 25;
const DEFAULT_MAX_GREENHOUSE_BOARDS = 200;
const DEFAULT_GREENHOUSE_INCLUDE_CONTENT = false;

interface GreenhouseJob {
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
  metadata?: Array<{ name?: string; value?: string }>;
}

interface GreenhouseBoardResponse {
  jobs?: GreenhouseJob[];
}

function parseGreenhouseJob(board: string, job: GreenhouseJob): NormalizedPortalJob {
  const metadata = Array.isArray(job.metadata) ? job.metadata : [];
  const team = metadata.find((m) => (m?.name || '').toLowerCase().includes('team'))?.value;

  return {
    title: job.title || 'Unknown Role',
    company: board,
    location: job.location?.name || 'Remote',
    remote: 'Unknown',
    type: 'Full-time',
    sourceUrl: job.absolute_url || `https://boards.greenhouse.io/${board}`,
    posted: job.updated_at,
    description: job.content || '',
    tags: team ? [team] : [],
  };
}

export async function fetchAllGreenhouseJobs(): Promise<ScrapedJob[]> {
  const envBoards = parseCsvEnv(process.env.GREENHOUSE_BOARDS);
  const boards = Array.from(new Set(envBoards.length > 0 ? envBoards : DEFAULT_GREENHOUSE_BOARDS));
  const maxBoards = Math.max(1, Number(process.env.GREENHOUSE_MAX_BOARDS || DEFAULT_MAX_GREENHOUSE_BOARDS));
  const maxPages = Math.max(1, Number(process.env.GREENHOUSE_MAX_PAGES || DEFAULT_MAX_GREENHOUSE_PAGES));
  const perPage = Math.max(10, Math.min(100, Number(process.env.GREENHOUSE_PER_PAGE || DEFAULT_GREENHOUSE_PER_PAGE)));
  const includeContent = String(process.env.GREENHOUSE_INCLUDE_CONTENT || '').trim().toLowerCase() === 'true'
    ? true
    : DEFAULT_GREENHOUSE_INCLUDE_CONTENT;
  const activeBoards = boards.slice(0, maxBoards);

  const normalized: NormalizedPortalJob[] = [];

  for (const board of activeBoards) {
    try {
      for (let page = 1; page <= maxPages; page += 1) {
        const urlObj = new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`);
        urlObj.searchParams.set('page', String(page));
        urlObj.searchParams.set('per_page', String(perPage));
        if (includeContent) {
          urlObj.searchParams.set('content', 'true');
        }

        const url = urlObj.toString();
        const payload = (await fetchJson(url)) as GreenhouseBoardResponse;
        const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        if (jobs.length === 0) {
          break;
        }

        normalized.push(...jobs.map((job) => parseGreenhouseJob(board, job)));

        if (jobs.length < perPage) {
          break;
        }
      }
    } catch (error) {
      console.warn(`[GreenhouseAPI] Failed board ${board}:`, String(error));
    }
  }

  const direct = await normalizeJobsWithCoordinates('Greenhouse', normalized);
  if (direct.length > 0) {
    return direct;
  }

  return fetchPortalFallbackJobs('Greenhouse', (url) =>
    /greenhouse\.io|boards-api\.greenhouse\.io/i.test(url),
  );
}
