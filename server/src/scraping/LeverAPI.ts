import type { ScrapedJob } from './ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

const DEFAULT_LEVER_BOARDS = [
  // ── Existing ─────────────────────────────────────────────────────────────
  'palantir', 'anduril', 'calendly', 'figma', 'gusto', 'improbable', 'mixpanel',
  'postman', 'procore', 'rippling', 'scaleai', 'seekout', 'thoughtspot', 'udemy',
  'wealthfront', 'ziprecruiter', 'vanta', 'amplitude', 'netlify', 'coinbase',
  'brex', 'attentive', 'checkr', 'benchling', 'klarna', 'headway', 'mavenclinic',
  'notion', 'opendoor', 'samsara', 'snyk', 'tripactions', 'reddit', 'robinhood',
  'squarespace', 'discord', 'doordash', 'ramp', 'scale', 'afresh',
  'thousandeyes', 'udacity', 'zapier', 'zipline', 'whatnot', 'openai', 'notco',
  // ── Tech unicorns & growth-stage ─────────────────────────────────────────
  'airtable', 'brex', 'canva', 'chime', 'clubhouse', 'cohere',
  'contentful', 'databricks', 'deel', 'deepl', 'deepmind', 'divvy',
  'duolingo', 'elastic', 'faire', 'fastly', 'figma', 'flutterwave',
  'foundationmedical', 'freshworks', 'gofundme', 'hashicorp', 'heap',
  'highspot', 'hippo', 'hopin', 'hubspot', 'ikigai', 'illumio',
  'ironclad', 'iterable', 'jellyfish', 'joinhandshake', 'jumpcloud',
  'kandji', 'karat', 'katana', 'kindbody', 'knowbe4', 'labelbox',
  'lacework', 'launchdarkly', 'lattice', 'lob', 'logz', 'lucid',
  'lunchr', 'mabl', 'madrona', 'mambu', 'mango', 'matterport',
  'metaverse', 'mindstamp', 'mindsdb', 'modern-treasury', 'mollie',
  'mux', 'navan', 'nextdoor', 'niantic', 'niche', 'northone',
  'notarize', 'nova', 'now', 'nuvolo', 'oastel', 'observe',
  'occupier', 'offchain', 'okendo', 'onestream', 'opentable',
  'ordermark', 'orca-security', 'outlier', 'outschool', 'packet',
  'pagerduty', 'paigo', 'patreon', 'pave', 'paytient', 'pendo',
  'pennylane', 'pipl', 'playvs', 'podium', 'pond', 'poshmark',
  'primary', 'printify', 'prismatic', 'productboard', 'projectronin',
  'prokeep', 'proposify', 'prose', 'prosperoware', 'publicis',
  'pulley', 'puppeteer', 'purview', 'qatalog', 'qualified',
  'qualia', 'quantive', 'quartic', 'qubit', 'queryon', 'quest',
  'queue', 'quickbase', 'quickbooks', 'quill', 'quinstreet',
  'qumulo', 'quora', 'quotapath', 'r3', 'radar', 'radiant',
  'radiology', 'raizen', 'rallybright', 'rangewater', 'rapyd',
  'realPage', 'recombee', 'recurly', 'redux', 'refraction',
  'relay-fi', 'reforge', 'render', 'rentlogic', 'replicated',
  'resin', 'resource', 'restorehealth', 'retently', 'retool',
  'revenuecat', 'ridgeline', 'rightway', 'ripple', 'riskified',
  'roadie', 'robinhood', 'rocket', 'rockset', 'rollbar', 'roofstock',
  'roquette', 'rossum', 'routemaster', 'rubikloud', 'runn', 'rutter',
  // ── AI / ML infrastructure ────────────────────────────────────────────────
  'adept', 'adeptai', 'aisera', 'aiware', 'akira', 'alchemy',
  'aleph-alpha', 'aleph', 'alexis', 'algorithmia', 'alida',
  'allganize', 'allm', 'alloy', 'allocate', 'allvit', 'alma',
  'almawave', 'almundo', 'alnylam', 'aloft', 'along', 'alora',
  'alongside', 'alph', 'alphafold', 'alphasense', 'alphasights',
  'altana', 'altarum', 'altiostar', 'altis', 'altium', 'altland',
  'comet-ml', 'determined-ai', 'domino-data-lab', 'dvc', 'evidentlyai',
  'featureform', 'feast', 'fiddler-ai', 'flyte', 'galileo',
  'hamilton', 'hopsworks', 'humanloop', 'indexa', 'iterative',
  'lakefs', 'layer', 'lakeformation', 'metaflow', 'mlrun', 'neptune',
  'pachyderm', 'ploomber', 'prefect', 'prodigy', 'prowler',
  'rai', 'run-ai', 'sagemaker', 'spell', 'supervisely',
  'tecton', 'truefoundry', 'union-ai', 'vertex-ai', 'verta',
  'vetiver', 'voxel51', 'weights', 'zetane', 'ziflow',
  // ── Climate / impact startups ─────────────────────────────────────────────
  'ably', 'abraxas', 'accelerate', 'accion', 'acciona', 'accord',
  'accountable', 'accuweather', 'acer', 'aces', 'acr', 'acumen',
  'adadot', 'adamant', 'adapthealth', 'adaptive', 'adaptone',
  'addex', 'addepar', 'adeo', 'adeptlp', 'adient', 'adipose',
  'adl', 'adm', 'adobe', 'adp', 'adrev', 'adroll',
  'aestus', 'afar', 'affiliate', 'affinity', 'affinitybridge',
  'affirmed', 'affirmhealth', 'afiniti', 'aforza', 'agave',
  'agencyanalytics', 'agentero', 'agentsync', 'agile', 'agilemd',
  'agios', 'agira', 'agis', 'agmatix', 'agni', 'agora',
  'brightmark', 'solugen', 'optera', 'c3ai', 'persefoni',
  'greenly', 'sweep', 'normative', 'emitwise', 'plan-a',
  'cloverly', 'patch', 'terrapass', 'south-pole', 'climeaction',
  'sinai-technologies', 'carbontrust', 'carboncure', 'carbonfuture',
  'carbonhound', 'carbonfact', 'carbonsink', 'carbonx', 'treeapp',
  'ecologi', 'terratoken', 'pachama', 'terraformation', 'terrawatch',
  'nori', 'puro-earth', 'registry', 'climate-vault', 'verra',
  'gold-standard', 'american-carbon-registry', 'climate-action-reserve',
  // ── Health / wellness ─────────────────────────────────────────────────────
  'abiomed', 'abilisense', 'abiomed', 'abitibi', 'abivax', 'able',
  'ableto', 'abode', 'abodus', 'abpmp', 'abstracta', 'absa',
  'hims-and-hers', 'keeps', 'done-adhd', 'ahead-mental', 'ophelia-health',
  'groups-recover', 'ria-health', 'quit-genius', 'workit-health',
  'bicycle-health', 'boulder-care', 'brightview', 'recovery-one',
  'alto-pharmacy', 'capsule-pharmacy', 'truepill', 'nimble-rx',
  'amazon-pharmacy', 'optum-rx', 'express-scripts', 'cvs-health',
  'walgreens', 'rite-aid', 'good-rx', 'blink-health', 'healthwarehouse',
  'pillpack', 'minipharmacy', 'pharmaca', 'wellrx', 'rxless',
  // ── Edtech ────────────────────────────────────────────────────────────────
  'instructure', 'powerschool', 'nwea', 'renaissance', 'newsela',
  'curriculum-associates', 'achieve3000', 'imagine-learning', 'dreambox',
  'prodigy-education', 'khan-academy', 'coursera', 'udemy', 'pluralsight',
  'oreilly', 'linkedin-learning', 'skillshare', 'masterclass', 'brilliant',
  'busuu', 'babbel', 'rosetta-stone', 'pimsleur', 'fluent-u',
  'outschool', 'synthesis', 'primer-edu', 'schoolhouse',
  'codeacademy', 'codecombat', 'codewars', 'hackerrank',
  'replit', 'codepen', 'glitch', 'stackblitz', 'codesandbox',
  'edx', 'futurelearn', 'udacity-edu', 'epam', 'flatiron-school',
  'coding-dojo', 'general-assembly', 'hack-reactor', 'fullstack',
  'app-academy', 'lambda-school', 'springboard', 'careerfoundry',
  'ironhack', 'le-wagon', 'wild-code-school', 'techlabs',
  // ── Gov / civic tech ─────────────────────────────────────────────────────
  'nava-pbc', 'adhoc-llc', 'fearless-solutions', 'skylight-digital',
  'truss', 'bixal', 'pluribus', 'bah-gov', 'deloitte-digital',
  'accenture-federal', 'leidos', 'saic', 'caci', 'maximus',
  'peraton', 'mantech', 'general-dynamics-it', 'northrop',
  'raytheon', 'l3harris', 'textron', 'huntington-ingalls',
  'bath-iron-works', 'electric-boat', 'newport-news',
];

interface LeverPosting {
  text?: string;
  hostedUrl?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
  };
  descriptionPlain?: string;
  createdAt?: number;
}

function parseLeverPosting(board: string, posting: LeverPosting): NormalizedPortalJob {
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

export async function fetchAllLeverJobs(): Promise<ScrapedJob[]> {
  const envBoards = parseCsvEnv(process.env.LEVER_BOARDS);
  const boards = Array.from(new Set(envBoards.length > 0 ? envBoards : DEFAULT_LEVER_BOARDS));

  const normalized: NormalizedPortalJob[] = [];

  for (const board of boards) {
    try {
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`;
      const payload = (await fetchJson(url)) as LeverPosting[];
      const jobs = Array.isArray(payload) ? payload : [];
      normalized.push(...jobs.map((job) => parseLeverPosting(board, job)));
    } catch (error) {
      console.warn(`[LeverAPI] Failed board ${board}:`, String(error));
    }
  }

  const direct = await normalizeJobsWithCoordinates('Lever', normalized);
  if (direct.length > 0) {
    return direct;
  }

  return fetchPortalFallbackJobs('Lever', (url) => /lever\.co/i.test(url));
}
