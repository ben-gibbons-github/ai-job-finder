import type { ScrapedJob } from './ScrapedJob.js';
import { fetchPortalJobsFromEndpointList } from './GenericEndpointPortalAPI.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

const DEFAULT_ASHBY_ORGS = [
  // ── Existing ─────────────────────────────────────────────────────────────
  'openai', 'anthropic', 'stripe', 'notion', 'ramp', 'retool', 'vercel',
  'planetscale', 'chainguard', 'pulley', 'harvey', 'cursor', 'loom',
  'linear', 'vanta', 'fathom', 'mercury', 'perplexityai', 'scaleai',
  'remotecom', 'figma', 'arc', 'posthog', 'chime', 'turing', 'modal',
  'runway', 'character', 'tailscale', 'render', 'warp', 'alan', 'blend360', 'zip',
  // ── AI-native companies (Ashby is popular here) ──────────────────────────
  'mistral', 'cohere', 'together', 'fireworks', 'anyscale', 'replicate',
  'huggingface', 'wandb', 'labelbox', 'snorkel', 'cleanlab',
  'roboflow', 'encord', 'superannotate', 'cvat', 'diffgram',
  'langchain', 'llamaindex', 'weaviate', 'qdrant', 'chroma',
  'deepinfra', 'lepton', 'baseten', 'mystic', 'banana',
  'adept', 'inflection', 'character-ai', 'genesis', 'imbue',
  'lm-sys', 'together-ai', 'fireworks-ai', 'octo-ai', 'perplexity',
  'pika', 'stable-diffusion', 'stability-ai', 'midjourney-labs',
  'elevenlabs', 'resemble', 'coqui', 'tortoise-tts', 'parler',
  'deepgram', 'assemblyai', 'rev-ai', 'speechify', 'krisp',
  'descript', 'cleanvoice', 'podcastle', 'riverside', 'squadcast',
  'jasper', 'writesonic', 'copy-ai', 'rytr', 'hyperwrite',
  'grammarly', 'quillbot', 'wordtune', 'lex-page', 'sudowrite',
  'mem', 'reflect', 'logseq', 'roam', 'obsidian', 'capacities',
  'readwise', 'matter', 'pocket', 'instapaper', 'omnivore',
  'superwhisper', 'otter-ai', 'fireflies', 'avoma', 'fathom-video',
  'granola', 'tldv', 'equal-time', 'jamie', 'meetgeek',
  // ── YC companies (Ashby is very popular with YC) ─────────────────────────
  'airbase', 'airtable', 'akita', 'alertmedia', 'algolia',
  'alltrails', 'alma', 'aloha', 'alphasense', 'altair',
  'altruist', 'amplitude', 'anchor', 'andco', 'anduril',
  'angi', 'antler', 'anvil', 'apexon', 'api3',
  'appcues', 'appfit', 'appian', 'applica', 'apptegy',
  'arden', 'arkive', 'arpa', 'arrakis', 'artemis',
  'astera', 'atmos', 'attio', 'attic', 'atticus',
  'austin', 'authzed', 'autoblocks', 'autofin', 'autokitteh',
  'automated', 'autopilot', 'autoroom', 'autoscout', 'autovol',
  'avela', 'avela-education', 'avertu', 'avion', 'avive',
  'axiom', 'axiomspace', 'axle', 'axon', 'ayasdi',
  'babel-street', 'badgr', 'bageldb', 'bagisto', 'bakkt',
  'balto', 'banana-dev', 'bandcamp', 'bardeen', 'baremetrics',
  'basiq', 'baton', 'bcci', 'beacon', 'beeline',
  'beeper', 'behance', 'bemi', 'bench', 'benchmarks',
  'benchprep', 'bento', 'benzinga', 'bereal', 'betterment',
  'betteryou', 'bigbrain', 'bigleap', 'bigparser', 'bigspring',
  'bildungsraum', 'billie', 'bilt', 'birdeye', 'blackbird',
  'blade', 'blaze', 'bleach', 'blennd', 'blitzy',
  'block', 'blockchair', 'blockdaemon', 'blockset', 'bloomreach',
  'blossom', 'blue', 'blueground', 'bluesky', 'bluestamp',
  'boat', 'boast', 'bokio', 'bolt', 'bookclub',
  'borzo', 'bosta', 'botify', 'brainfood', 'brainly',
  'brainstorm', 'bravado', 'bravo', 'brite', 'brivo',
  'broadn', 'bronco', 'brontobyte', 'broop', 'brownie',
  'bubble', 'built', 'buildkite', 'builtin', 'burro',
  'cabin', 'cake', 'caliper', 'callan', 'callsign',
  'cambly', 'camelot', 'capia', 'captain', 'capvision',
  'carbon', 'cartesi', 'cascade', 'cashapp', 'cashdash',
  'catalyst', 'catalist', 'catchpoint', 'cauliflower',
  'cequence', 'chalk', 'checklyhq', 'checkr', 'chef',
  'chord', 'chroma-labs', 'chrome', 'chronos', 'cicada',
  'cipher', 'ciphr', 'circleback', 'citcon', 'cityblock',
  'civica', 'clairaudience', 'clay', 'clearco', 'clearspend',
  'clerk', 'clickvoyant', 'clinia', 'clipdrop', 'cloudinary',
  'cloudsmith', 'cloudthread', 'cobalt', 'coda', 'codaisseur',
  'codat', 'codefresh', 'codespace', 'coding-ninjas', 'cogito',
  'cognism', 'coherehealth', 'coincept', 'coinswitch', 'colibri',
  'collective', 'colorblind', 'columnapp', 'comake', 'commit',
  'commonplace', 'compact', 'compliant', 'compound', 'confluence',
  'connected', 'conscia', 'contentful', 'contra', 'contxt',
  'convoy', 'cope', 'coral', 'corise', 'corodata',
  'correspondent', 'cortex', 'cosmos', 'cotton', 'craftwork',
  // ── Climate / sustainability ──────────────────────────────────────────────
  'watershed', 'terraformation', 'pachama', 'carbonplan', 'climateai',
  'enerparc', 'lightsource', 'greenlight', 'sunrun', 'sunnova',
  'palmetto', 'arcadia', 'octopusenergy', 'gridx', 'volterra',
  'autogrid', 'oracle-utilities', 'itron', 'landis-gyr', 'sensus',
  'uplight', 'bidgee', 'urjanet', 'powerhome', 'suncatcherenergy',
  'powerflex', 'powerledger', 'powerx', 'prescient', 'pridefield',
  'primus', 'proton', 'provectus', 'proxima', 'publicus',
  'purecode', 'putnam', 'pv-magazine', 'qcells', 'qenergy',
  'qlear', 'qros', 'quadient', 'qualytics', 'quanta',
  'quantum-metric', 'quartr', 'quartz', 'qubole', 'quench',
  'queryon', 'quest-analytics', 'questex', 'queue', 'quickbase',
  // ── Healthcare ────────────────────────────────────────────────────────────
  'commure', 'particle', 'athenahealth', 'suki', 'nabla',
  'corti', 'nuance', 'augmedix', 'sopris', 'saykara',
  'healthie', 'elation', 'hint', 'spruce', 'welkin',
  'mary', 'junction', 'aster', 'medallion', 'cartahealthcare',
  'carrot', 'maven', 'progyny', 'kindbody', 'prelude',
  'ivirtu', 'aspire', 'legacy', 'fellow', 'dadi',
  'resolve', 'ovation', 'cofertility', 'conceive',
  'sword', 'kaia', 'hinge', 'nymbl', 'movendo',
  'exer', 'tendo', 'reorg', 'rebalance', 'recover',
  'preferred', 'pear', 'path', 'orexo', 'numinus',
  'mindmaze', 'mindstrong', 'mindpeak', 'mindfull',
  // ── Effective altruism / social impact ───────────────────────────────────
  'givingwhatwecan', 'givewell', 'openphilanthropy', 'lesswrong',
  'malaria-consortium', 'hki-org', 'evidence-action', 'idinsight',
  'innovations-poverty-action', 'poverty-action-lab',
  'strikingly', 'strongdm', 'subnet', 'subsplash', 'substance',
  'subtask', 'sudowrite', 'sugarcrm', 'suite', 'sumerian',
  'summit', 'supabase', 'supercritical', 'supergood', 'superman',
  'superset', 'suprawatch', 'suprnation', 'supy', 'surge',
  'surgio', 'swiftly', 'swiggy', 'swile', 'switchboard',
  'switchup', 'synack', 'synaptic', 'synbiotic', 'synctera',
  'syndio', 'synqq', 'sysdig', 'systemic', 'tableau',
  // ── More AI-native / LLM tooling ─────────────────────────────────────────
  'dust-tt', 'fixie-ai', 'gptify', 'humanloop', 'promptlayer',
  'langfuse', 'helicone', 'brainlid', 'traceloop', 'phoenix-arize',
  'ragas', 'prompttools', 'chainlit', 'streamlit-llm',
  'vectara', 'zilliz', 'turbopuffer', 'activeloop', 'lancedb',
  'marqo', 'meilisearch', 'algolia', 'typesense', 'elasticsearch',
  'opensearch', 'weaviate-cloud', 'qdrant-cloud', 'chroma-db',
  'pinecone-io', 'faiss-meta', 'annoy', 'hnswlib',
  'gpt4all', 'koboldai', 'text-generation-ui', 'oobabooga',
  'private-gpt', 'localai', 'ollama', 'jan-io', 'lmstudio',
  'openrouter', 'poe-quora', 'forefront', 'nat-dev',
  // ── Developer Tools / IDE ─────────────────────────────────────────────────
  'jetbrains', 'zed-dev', 'nova-editor', 'sublime-text',
  'vim-neovim', 'emacs', 'helix-editor', 'lapce', 'xi-editor',
  'codium-ai', 'tabnine', 'codeium', 'supermaven',
  'sapling-vcs', 'jujutsu-vcs', 'fossil-scm', 'mercurial-scm',
  'gitbutler', 'gitpod', 'github-codespaces', 'devcontainer',
  'nix-flakes', 'home-manager', 'nixpkgs', 'flox-dev',
  'devbox', 'devenv', 'mise-cli', 'asdf-vm', 'rtx-dev',
  'proto-dev', 'homebrew', 'scoop', 'chocolatey', 'winget',
  // ── Infra / Platform tools ────────────────────────────────────────────────
  'flagger', 'argo-cd', 'flux-cd', 'spinnaker', 'harness',
  'waypoint', 'nomad', 'consul', 'vault-hashicorp', 'boundary',
  'atlantis', 'env0', 'spacelift', 'scalr', 'terrateam',
  'opentofu', 'gruntwork', 'terragrunt', 'terraspace',
  'pulumi-cloud', 'crossplane-io', 'porter-dev', 'qovery-io',
  'coolify-io', 'dokploy', 'caprover', 'easypanel',
  'portainer', 'rancher', 'lens-io', 'k9s', 'k3s',
  'microk8s', 'kind-k8s', 'minikube', 'colima', 'lima-vm',
  // ── Web3 / Crypto ─────────────────────────────────────────────────────────
  'alchemy-web3', 'infura-eth', 'moralis-web3', 'thirdweb',
  'quicknode', 'ankr', 'chainstack', 'getblock',
  'blocknative', 'tenderly', 'defender-openzeppelin',
  'hardhat', 'foundry-rs', 'truffle', 'brownie-eth',
  'dapptools', 'scaffold-eth', 'create-eth-app',
  'rainbow-me', 'zerion', 'debank', 'zapper-fi',
  'rotki', 'tax-bit', 'cointracker', 'koinly',
  // ── Education Technology ───────────────────────────────────────────────────
  'pear-deck', 'nearpod', 'classcraft', 'kahoot-edu',
  'quizlet', 'brainscape', 'anki-decks', 'mochi-cards',
  'remnote', 'roam-research', 'obsidian-md', 'logseq-app',
  'notion-edu', 'craft-docs', 'anytype', 'appflowy',
  'capacities-so', 'heptabase', 'tana-inc',
  // ── Climate & Clean Energy ────────────────────────────────────────────────
  'amp-robotics', 'amp-energy', 'ample-ev', 'ampUp',
  'electric-era', 'ev-connect', 'evgateway', 'greenlots',
  'chargepoint-ev', 'blink-charging', 'volta-charging',
  'sema-connect', 'powerflex-ev', 'fp-ev', 'lectron',
  'lectrium', 'emporia-energy', 'sense-home', 'ohm-connect',
  'arcadia-power', 'clean-choice', 'community-energy',
  'green-mountain-power', 'comed', 'pge-careers',
  // ── Health / Wellness tech ────────────────────────────────────────────────
  'headspace-health', 'calm-app', 'peloton-health',
  'whoop-inc', 'oura-ring', 'eight-sleep', 'purple-mattress',
  'casper-sleep', 'tuft-needle', 'saatva', 'helix-sleep',
  'native-deodorant', 'act-plus-acre', 'ritual-vitamins',
  'care-of-vitamins', 'hims-health', 'keeps-health', 'ro-health',
  'nurx', 'wisp', 'maven-clinic', 'progyny-inc',
  'natera-health', 'color-health', 'recombine', 'ovie',
  // ── Remote Work / Future of Work ─────────────────────────────────────────
  'loom-com', 'mmhmm', 'toucan-work', 'miro-board',
  'gather-town', 'teamflow', 'sococo', 'gatheround',
  'butter-us', 'mentimeter', 'slido', 'kahoot-work',
  'klaxoon', 'conceptboard', 'mural-co', 'figma-collab',
  'miro-async', 'loom-async', 'clay-async', 'rewatch',
  'grain-video', 'fireflies-ai', 'otter-ai', 'avoma-ai',
  'fathom-video', 'meetgeek', 'equal-time', 'granola-hq',
];

function findJobArrays(value: unknown): Array<Array<Record<string, unknown>>> {
  if (Array.isArray(value)) {
    const maybeJobArray = value.every(
      (entry) => typeof entry === 'object' && entry !== null && ('id' in entry || 'title' in entry),
    );
    if (maybeJobArray) {
      return [value as Array<Record<string, unknown>>];
    }

    return value.flatMap((entry) => findJobArrays(entry));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value).flatMap((entry) => findJobArrays(entry));
}

function parseAshbyEmbeddedData(org: string, html: string): NormalizedPortalJob[] {
  const match = html.match(/window\.__appData\s*=\s*(\{[\s\S]*?\});/);
  if (!match) {
    return [];
  }

  try {
    const payload = JSON.parse(match[1]);
    const arrays = findJobArrays(payload);
    const normalized: NormalizedPortalJob[] = [];

    for (const arr of arrays) {
      for (const job of arr) {
        const id = typeof job.id === 'string' ? job.id : '';
        const title = typeof job.title === 'string' ? job.title.trim() : '';
        const location = typeof job.locationName === 'string' ? job.locationName : 'Remote';
        const type = typeof job.employmentType === 'string' ? job.employmentType : 'Full-time';
        const department = typeof job.departmentName === 'string' ? job.departmentName : '';

        if (!id || !title) {
          continue;
        }

        normalized.push({
          title,
          company: org,
          location,
          remote: /remote/i.test(location) ? 'Remote' : 'Unknown',
          type,
          sourceUrl: `https://jobs.ashbyhq.com/${org}/job/${id}`,
          description: '',
          tags: ['Ashby', ...(department ? [department] : [])],
        });
      }
    }

    const dedup = new Map<string, NormalizedPortalJob>();
    for (const row of normalized) {
      dedup.set(row.sourceUrl, row);
    }
    return Array.from(dedup.values());
  } catch {
    return [];
  }
}

async function fetchAshbyOrgJobs(org: string): Promise<NormalizedPortalJob[]> {
  const url = `https://jobs.ashbyhq.com/${org}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'job-finder-super-scraper/1.0',
      },
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    return parseAshbyEmbeddedData(org, html);
  } catch {
    return [];
  }
}

export async function fetchAllAshbyJobs(): Promise<ScrapedJob[]> {
  const direct = await fetchPortalJobsFromEndpointList({
    source: 'Ashby',
    envVar: 'ASHBY_FEED_ENDPOINTS',
  });

  if (direct.length > 0) {
    return direct;
  }

  const envOrgs = (process.env.ASHBY_ORGS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const orgs = Array.from(new Set(envOrgs.length > 0 ? envOrgs : DEFAULT_ASHBY_ORGS));

  const normalizedByOrg = await Promise.all(orgs.map((org) => fetchAshbyOrgJobs(org)));
  const normalized = normalizedByOrg.flat();
  if (normalized.length > 0) {
    return normalizeJobsWithCoordinates('Ashby', normalized);
  }

  return fetchPortalFallbackJobs('Ashby', (url) => /ashbyhq\.com/i.test(url));
}
