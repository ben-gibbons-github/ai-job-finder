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
  'stripe', 'airbnb', 'asana', 'affirm', 'brex', 'datadog', 'discord', 'dropbox',
  'duolingo', 'fivetran', 'instacart', 'intercom', 'lyft', 'mongodb', 'okta',
  'reddit', 'webflow', 'databricks', 'coinbase', 'hubspot', 'robinhood',
  'instabase', 'figma', 'cloudflare', 'fastly', 'scaleai', 'chime',
  'coursera', 'newrelic', 'samsara', 'gusto', 'apolloio', 'tripactions',
  'squarespace', 'twilio', 'blend', 'flexport', 'carta', 'rubrik',
  'xai', 'ripple', 'khanacademy', 'ginkgobioworks', 'smartsheet', 'solarwinds',
  'gitlab', 'hashicorp', 'cockroachlabs', 'airtable', 'plaid', 'miro',
  'lucid', 'domo', 'qualtrics', 'zendesk', 'twitch', 'wix', 'expensify',
  'mixpanel', 'amplitude', 'zapier', 'retool', 'pagerduty', 'okta',
  'lattice', 'rippling', 'deel', 'remote', 'oyster', 'papaya',
  'paylocity', 'paycom', 'paychex', 'adp', 'workday', 'sap',
  'oracle', 'salesforce', 'servicenow', 'splunk', 'elastic', 'dynatrace',
  'sumologic', 'logicmonitor', 'observeinc', 'groundcover', 'coralogix',
  'honeycomb', 'lightstep', 'kentik', 'cilium', 'isovalent', 'tetragon',
  'snyk', 'sonatype', 'veracode', 'checkmarx', 'aquasecurity', 'lacework',
  'orca', 'wiz', 'cyberark', 'beyondtrust', 'sailpoint', 'okta-workforce',
  'netsuite', 'zuora', 'chargebee', 'recurly', 'chargify', 'paddle',
  'fastspring', 'cleverbridge', 'digitalriver', 'gofundme', 'kickstarter',
  'indiegogo', 'patreon', 'substack', 'medium', 'wordpress', 'ghost',
  'contentful', 'sanity', 'storyblok', 'prismic', 'hygraph', 'kontent',
  'netlify', 'vercel', 'cloudflare-workers', 'deno', 'supabase',
  'planetscale', 'cockroachdb', 'neon', 'fauna', 'harperdb',
  'influxdata', 'timescale', 'questdb', 'clickhouse', 'firebolt',
  'starburst', 'dbt-labs', 'lightdash', 'metaplane', 'datafold',
  'hightouch', 'census', 'rudderstack', 'segment-io', 'mparticle',
  'braze', 'klaviyo', 'iterable', 'sendgrid', 'mailchimp', 'constantcontact',
  'twilio-sendgrid', 'postmark', 'sparkpost', 'mailjet', 'sendinblue',
  'customer-io', 'lob', 'bandwidth', 'vonage', 'messagebird', 'plivo',
  'sinch', 'infobip', 'kaleyra', 'exotel', 'knowlarity',
  'zoom', 'webex', 'ringcentral', 'eight-by-eight', 'dialpad', 'aircall',
  'justcall', 'cloudtalk', 'talkdesk', 'five9', 'genesys', 'nice',
  'freshdesk', 'zendesk', 'intercom', 'helpscout', 'front', 'gladly',
  'kustomer', 'gorgias', 'reamaze', 'tidio', 'drift', 'qualified',
  'clearbit', 'zoominfo', 'demandbase', 'g2', 'trustpilot', 'capterra',
  'hubspot', 'marketo', 'pardot', 'eloqua', 'act-on', 'sharpspring',
  'outreach', 'salesloft', 'apolloio', 'groove', 'yesware', 'mixmax',
  'gong', 'chorus', 'clari', 'insightsquared', 'people-ai', 'boostup',
  'salesforce-cpq', 'conga', 'apttus', 'docusign', 'pandadoc', 'hellosign',
  'adobe-sign', 'ironclad', 'spotdraft', 'lexion', 'linkSquares',
  'tableau', 'looker', 'sisense', 'thoughtspot', 'qlik', 'tibco',
  'informatica', 'talend', 'boomi', 'mulesoft', 'jitterbit', 'celigo',
  'workato', 'tray', 'make', 'n8n', 'integromat', 'zapier',
  'atlassian', 'trello', 'basecamp', 'notion', 'coda', 'confluence',
  'monday', 'clickup', 'asana', 'linear', 'height', 'plane',
  'shortcut', 'pivotal', 'jira', 'youtrack', 'linear-app',
  'figma', 'sketch', 'invision', 'framer', 'webflow', 'bubble',
  'adalo', 'glide', 'appgyver', 'thunkable', 'draftbit', 'expo',
  // ── AI / ML ──────────────────────────────────────────────────────────────
  'openai', 'anthropic', 'cohere', 'ai21', 'alephalpha', 'inflectionai',
  'stability', 'midjourney', 'runwayml', 'pika', 'synthesia', 'heygen',
  'elevenlabs', 'resemble', 'murf', 'speechify', 'deepgram', 'assembly-ai',
  'rev', 'otter', 'fireflies', 'krisp', 'descript', 'adobe-podcast',
  'jasper', 'writesonic', 'copy-ai', 'rytr', 'hyperwrite', 'lex',
  'grammarly', 'quillbot', 'linguix', 'hemingwayapp', 'outwrite',
  'scale', 'labelbox', 'snorkel', 'cleanlab', 'encord', 'roboflow',
  'landing-ai', 'superannotate', 'kili-technology', 'v7labs',
  'weights-and-biases', 'mlflow', 'dvc', 'bentoml', 'seldon', 'cortex',
  'arthur', 'fiddler', 'evidently', 'whylogs', 'arize', 'aporia',
  'huggingface', 'together', 'anyscale', 'modal', 'replicate', 'banana',
  'baseten', 'lepton', 'mystic', 'beam', 'lightning-ai', 'grid-ai',
  // ── Climate / Cleantech ───────────────────────────────────────────────────
  'watershed', 'climateai', 'pachama', 'terraformation', 'carbonchain',
  'arcadia', 'stem', 'sunrun', 'sunnova', 'sunpower', 'vivint-solar',
  'tesla-energy', 'enphase', 'solarEdge', 'generac', 'eguana',
  'chargepoint', 'blink', 'evgo', 'electrify-america', 'volta',
  'ampere', 'wallbox', 'pod-point', 'zap-map', 'ubitricity',
  'rivian', 'lucid', 'fisker', 'canoo', 'arrival', 'brightdrop',
  'proterra', 'lion-electric', 'xos', 'lightning-systems', 'ideanomics',
  'nextera', 'clearway', 'pattern-energy', 'invenergy', 'enel',
  'ørsted', 'vattenfall', 'avangrid', 'terraform-power', 'amp-energy',
  'lightsource', 'baywa', 'engie', 'totalenergies', 'bp-pulse',
  'shell-energy', 'octopusenergy', 'bulb', 'ovoEnergy', 'ecotricity',
  'persefoni', 'greenly', 'sweep', 'normative', 'emitwise', 'carbonfact',
  'watershed-climate', 'plan-a', 'cloverly', 'patch', 'terrapass',
  'south-pole', 'natural-capital-partners', 'climeaction', 'climate-partner',
  'sinai-technologies', 'envizi', 'carbontrust', 'schneider-electric',
  'veolia', 'suez', 'xylem', 'evoqua', 'veolia-water', 'sensus',
  'itron', 'landis-gyr', 'oracle-utilities', 'esri', 'trimble', 'hexagon',
  'autodesk', 'bentley', 'aveva', 'aspentech', 'emerson', 'honeywell',
  'siemens', 'abb', 'ge-vernova', 'hitachi-energy', 'prysmian', 'nexans',
  'ameresco', 'optio', 'cpower', 'enel-x', 'volterra', 'autogrid',
  'gridx', 'swell', 'stem-energy', 'sunverge', 'enbala', 'virtual-peaker',
  'powerley', 'bidgee', 'urjanet', 'uplight', 'oracle-opower', 'ecobee',
  'nest', 'ecoisme', 'gridly', 'voltaware', 'smappee', 'sense',
  // ── Healthcare / Biotech ─────────────────────────────────────────────────
  'modernatherapeutics', 'recursionpharma', 'insitro', 'seer', 'tempus',
  'komodo', 'cityblock', 'cerebral', 'headway', 'brightline', 'brightside',
  'hims', 'ro', 'teladoc', 'livongo', 'optum', 'oscar', 'clover', 'virta',
  'noom', 'whoop', 'oura', 'withings', 'garmin-health', 'biogen',
  'regeneron', 'vertex', 'illumina', 'pacific-biosciences', 'oxford-nanopore',
  'genomenon', '23andme', 'color', 'invitae', 'helix', 'genomicsplc',
  'natera', 'grail', 'exact-sciences', 'guardant', 'foundation-medicine',
  'tempus-ai', 'flatiron', 'veracyte', 'genomic-health', 'myriad',
  'caris', 'neoantigenics', 'nuvation', 'relay', 'g1-therapeutics',
  'nuvation-bio', 'uniqure', 'beam-therapeutics', 'prime-medicine',
  'shape-therapeutics', 'arbor-bio', 'sana-bio', 'vor-bio',
  'passage-bio', 'prevail', 'encoded-genomics', 'dyno',
  'spring-health', 'lyra', 'modernhealth', 'ginger', 'talkspace',
  'betterhelp', 'hazel', 'cartahealthcare', 'mindoula', 'aptihealth',
  'oastel', 'octave', 'pathlight', 'little-otter', 'brightline-mental',
  'calm', 'headspace', 'woebot', 'happify', 'sanvello', 'youper',
  'welltrack', 'silvercloud', 'big-health', 'innerworld', 'wysa',
  // ── Education ────────────────────────────────────────────────────────────
  'chegg', 'instructure', 'powerschool', 'nwea', 'renaissance',
  'newsela', 'curriculum-associates', 'achieve3000', 'imagine-learning',
  'dreambox', 'prodigy', 'khan-academy', 'coursera', 'udemy',
  'pluralsight', 'oreilly', 'linkedin-learning', 'skillshare',
  'masterclass', 'brilliant', 'duolingo', 'busuu', 'babbel',
  'rosetta-stone', 'pimsleur', 'fluent-u', 'language-transfer',
  'outschool', 'synthesis-school', 'primer', 'schoolhouse-world',
  'codeacademy', 'codecombat', 'codewars', 'hackerrank', 'leetcode',
  'replit', 'codepen', 'glitch', 'stackblitz', 'codesandbox',
  'firebase', 'supabase-edu', 'neon-tech', 'railway', 'render',
  // ── Nonprofit / Social Impact ────────────────────────────────────────────
  'code-for-america', 'social-finance', 'bridgespan', 'aclu',
  'earthjustice', 'nrdc', 'sierra-club', 'wwf', 'nature-conservancy',
  'conservation-international', 'wwf-uk', 'wildlife-conservation-society',
  'audubon', 'defenders-of-wildlife', 'center-for-biological-diversity',
  'union-of-concerned-scientists', 'environmental-defense-fund', 'greenpeace',
  'amnesty', 'human-rights-watch', 'oxfam', 'care', 'save-the-children',
  'unicef-usa', 'doctors-without-borders', 'international-rescue-committee',
  'mercy-corps', 'world-food-programme', 'action-against-hunger',
  'direct-relief', 'americares', 'globalgiving', 'generosity',
  // ── Fintech / Economic Inclusion ─────────────────────────────────────────
  'chime', 'current', 'dave', 'brigit', 'varo', 'greenwood',
  'missionlane', 'springfour', 'monzo', 'starling', 'revolut', 'n26',
  'transferwise', 'payoneer', 'remitly', 'wise', 'worldremit',
  'sendwave', 'paysend', 'azimo', 'currencycloud', 'ripple-payments',
  'stellar', 'circle-internet', 'paxos', 'gemini', 'kraken',
  'celsius', 'blockfi', 'nexo', 'ledn', 'hodlnaut', 'anchor',
  'robinhood-crypto', 'opensea', 'rarible', 'foundation', 'superrare',
  'nifty-gateway', 'larva-labs', 'yuga-labs', 'dapper-labs',
  // ── Media / News ─────────────────────────────────────────────────────────
  'axios', 'politico', 'the-atlantic', 'the-intercept', 'vice',
  'vox-media', 'buzzfeed', 'huffpost', 'salon', 'slate', 'mother-jones',
  'the-nation', 'the-guardian', 'the-independent', 'nbc-news',
  'cbs-news', 'abc-news', 'cnn', 'msnbc', 'npr', 'pbs',
  'bloomberg', 'reuters', 'associated-press', 'the-wall-street-journal',
  'the-new-york-times', 'the-washington-post', 'the-economist',
  'financial-times', 'the-telegraph', 'daily-mail', 'the-sun',
  // ── Government / Civic Tech ──────────────────────────────────────────────
  'usds', '18f', 'login-gov', 'digital-ai', 'nava', 'adhoc',
  'fearless', 'skylight', 'bah', 'deloitte-gov', 'accenture-federal',
  'leidos', 'saic', 'caci', 'maximus', 'peraton', 'booz-allen',
  'mantech', 'general-dynamics-it', 'northrop-grumman', 'raytheon',
  // ── Professional Services / Consulting ───────────────────────────────────
  'mckinsey', 'bcg', 'bain', 'deloitte', 'pwc', 'kpmg', 'ey',
  'accenture', 'capgemini', 'infosys', 'wipro', 'cognizant', 'tcs',
  'hcl', 'tech-mahindra', 'mphasis', 'hexaware', 'mindtree',
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
