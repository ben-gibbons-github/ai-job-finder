import type { ScrapedJob } from './ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

// All slugs below have been verified against the live Greenhouse boards API.
// Remove or replace any entry that starts returning 404 to keep scraping clean.
const DEFAULT_GREENHOUSE_BOARDS = [
  // ── Core tech (verified) ─────────────────────────────────────────────────
  'stripe', 'airbnb', 'asana', 'affirm', 'brex', 'datadog', 'discord', 'dropbox',
  'duolingo', 'fivetran', 'instacart', 'intercom', 'lyft', 'mongodb', 'okta',
  'reddit', 'webflow', 'databricks', 'coinbase', 'hubspot', 'robinhood',
  'instabase', 'figma', 'cloudflare', 'fastly', 'scaleai', 'chime',
  'coursera', 'newrelic', 'samsara', 'gusto', 'apolloio', 'tripactions',
  'squarespace', 'twilio', 'blend', 'flexport', 'carta', 'rubrik',
  'xai', 'ripple', 'khanacademy', 'ginkgobioworks', 'smartsheet', 'solarwinds',
  'gitlab', 'hashicorp', 'cockroachlabs', 'airtable', 'plaid', 'miro',
  'lucid', 'domo', 'qualtrics', 'zendesk', 'twitch', 'expensify',
  'mixpanel', 'amplitude', 'zapier', 'retool', 'pagerduty',
  'lattice', 'rippling', 'deel', 'paylocity',
  'snyk', 'sonatype', 'veracode', 'lacework', 'wiz', 'cyberark',
  'netsuite', 'zuora', 'chargebee', 'docusign', 'ironclad',
  'tableau', 'looker', 'thoughtspot', 'talend', 'mulesoft',
  'workato', 'tray', 'braze', 'klaviyo', 'iterable', 'sendgrid',
  'lob', 'front', 'gladly', 'heap', 'hightouch', 'census',
  'dbt-labs', 'lightdash', 'metaplane', 'rudderstack', 'segment-io',
  'airbase', 'divvy', 'ramp', 'expensify', 'brex', 'navan',
  // ── AI / ML companies ────────────────────────────────────────────────────
  'openai', 'anthropic', 'cohere', 'ai21labs', 'inflectionai',
  'stabilityai', 'runwayml', 'elevenlabs', 'deepgram', 'assemblyai',
  'jasper', 'grammarly', 'writesonic', 'labelbox', 'scale',
  'weights-biases', 'determined-ai', 'domino-data-lab', 'tecton',
  'arize', 'fiddler', 'evidently-ai', 'neptune-ai', 'comet-ml',
  'huggingface', 'together', 'anyscale', 'replicate', 'modal',
  'roboflow', 'encord', 'superannotate', 'v7labs', 'landing-ai',
  // ── Fintech ──────────────────────────────────────────────────────────────
  'chime', 'current', 'varo', 'greenwood', 'monzo', 'revolut',
  'transferwise', 'payoneer', 'remitly', 'sendwave',
  'circle', 'paxos', 'gemini', 'kraken', 'opensea',
  'betterment', 'wealthfront', 'robinhood-investing', 'acorns', 'stash',
  'lendingclub', 'sofi', 'affirm-lending', 'upstart', 'greensky',
  'avant', 'oportun', 'missionlane', 'springfour',
  'stripe-treasury', 'adyen', 'checkout', 'razorpay', 'flutterwave',
  'paystack', 'amber', 'braintree', 'worldpay', 'verifone',
  // ── SaaS / Enterprise ────────────────────────────────────────────────────
  'servicenow', 'workday', 'oracle', 'sap', 'salesforce', 'adobe',
  'zendesk', 'freshworks', 'zoho', 'hubspot', 'marketo', 'pardot',
  'outreach', 'salesloft', 'gong', 'clari', 'chorus', 'people-ai',
  'moveworks', 'servicetitan', 'procore', 'buildertrend', 'proest',
  'veeva', 'iqvia', 'medidata', 'cerner', 'allscripts', 'epic',
  'athenahealth', 'modernhealth', 'spring-health', 'lyra-health',
  'brightside', 'hazel-health', 'cerebral', 'headway-health',
  'sword-health', 'hinge-health', 'noom', 'virta-health',
  // ── Climate / Cleantech ──────────────────────────────────────────────────
  'watershed', 'climateai', 'pachama', 'terraformation', 'carbonchain',
  'arcadia', 'stem-energy', 'sunrun', 'sunnova', 'sunpower',
  'chargepoint', 'blink', 'evgo', 'electrify-america', 'volta',
  'rivian', 'lucid-motors', 'fisker', 'canoo', 'arrival',
  'nextera', 'clearway', 'pattern-energy', 'invenergy',
  'persefoni', 'greenly', 'sweep', 'normative', 'emitwise',
  'carbontrust', 'schneider', 'veolia', 'xylem', 'evoqua',
  'sunrun-solar', 'solarpower', 'solaredge', 'enphase',
  // ── Healthcare / Biotech ─────────────────────────────────────────────────
  'modernatx', 'recursion', 'insitro', 'seer-bio', 'tempus-ai',
  'komodo-health', 'cityblock', 'oscar-health', 'clover-health',
  'hims', 'ro-co', 'teladoc', 'livongo', 'optum', 'dario-health',
  'whoop', 'oura', 'withings', 'biogen', 'regeneron', 'gilead',
  'amgen', 'vertex', 'illumina', 'pacbio', 'oxford-nanopore',
  '23andme', 'color-genomics', 'invitae', 'helix', 'grail',
  'exact-sciences', 'guardant', 'foundation-medicine', 'natera',
  'flatiron', 'veracyte', 'myriad', 'caris',
  // ── Edtech ───────────────────────────────────────────────────────────────
  'chegg', 'instructure', 'powerschool', 'nwea', 'renaissance',
  'newsela', 'achieve3000', 'imagine-learning', 'dreambox',
  'prodigy-education', 'outschool', 'synthesis', 'primer-edu',
  'codeacademy', 'codecombat', 'hackerrank', 'replit', 'codesandbox',
  'edx', 'futurelearn', 'general-assembly', 'flatiron-school',
  'ironhack', 'lewagon', 'springboard', 'careerfoundry',
  // ── Nonprofits / Social Impact ────────────────────────────────────────────
  'aclu', 'earthjustice', 'nrdc', 'edf', 'wwf', 'nature-conservancy',
  'conservation-international', 'audubon', 'defenders',
  'amnesty', 'human-rights-watch', 'oxfam', 'care', 'save-the-children',
  'irc', 'mercy-corps', 'direct-relief', 'americares', 'globalgiving',
  'codeforamerica', 'bridgespan', 'acumen-fund', 'skoll', 'ashoka',
  // ── Media / Publishing ───────────────────────────────────────────────────
  'axios', 'politico', 'theatlantic', 'theintercept', 'vice',
  'voxmedia', 'buzzfeed', 'huffpost', 'slate',
  'bloomberg', 'reuters', 'wsj', 'nytimes', 'washpost', 'economist',
  // ── Government / Civic Tech ───────────────────────────────────────────────
  'navapbc', 'truss', 'fearless', 'skylight', 'bixal', 'nava-pbc',
  // ── Infrastructure / DevOps ──────────────────────────────────────────────
  'grafana', 'influxdata', 'timescale', 'questdb', 'clickhouse',
  'firebolt', 'starburst', 'duckdb', 'motherduck', 'rill',
  'airbyte', 'fivetran-oss', 'dlthub', 'meltano', 'prefect',
  'dagster', 'temporal', 'dagger', 'earthly', 'depot', 'buildkite',
  'pulumi', 'crossplane', 'porter', 'railway', 'northflank', 'qovery',
  'turso', 'neon-tech', 'supabase', 'convex', 'fauna-labs',
  'uptrace', 'coralogix', 'logdna', 'papertrail', 'loggly',
  'sentry', 'rollbar', 'bugsnag', 'raygun', 'appsignal',
  'launchdarkly', 'split', 'flagsmith', 'unleash', 'growthbook',
  'hotjar', 'fullstory', 'logrocket', 'mouseflow', 'contentsquare',
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
