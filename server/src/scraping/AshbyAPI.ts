import type { ScrapedJob } from './ScrapedJob.js';
import { fetchPortalJobsFromEndpointList } from './GenericEndpointPortalAPI.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

const DEFAULT_ASHBY_ORGS = [
  // Existing
  'openai', 'anthropic', 'stripe', 'notion', 'ramp', 'retool', 'vercel',
  'planetscale', 'chainguard', 'pulley', 'harvey', 'cursor', 'loom',
  'linear', 'vanta', 'fathom', 'mercury', 'perplexityai', 'scaleai',
  'remotecom', 'figma', 'arc', 'posthog', 'chime', 'turing', 'modal',
  'runway', 'character', 'tailscale', 'render', 'warp', 'alan', 'blend360', 'zip',
  // AI / ML
  'mistral', 'cohere', 'together', 'fireworks', 'anyscale', 'replicate',
  'huggingface', 'wandb', 'labelbox', 'scale', 'snorkel', 'cleanlab',
  'robflow', 'encord', 'superannotate', 'cvat', 'diffgram',
  'langchain', 'llamaindex', 'weaviate', 'qdrant', 'chroma',
  'deepinfra', 'lepton', 'baseten', 'mystic', 'banana',
  // Dev tools
  'dagger', 'earthly', 'depot', 'buildkite', 'circleci', 'argo',
  'temporal', 'prefect', 'dagster', 'airflow', 'kedro',
  'terraform', 'pulumi', 'crossplane', 'porter', 'railway',
  'fly', 'northflank', 'qovery', 'coolify', 'dokku',
  'turso', 'neon', 'supabase', 'xata', 'convex', 'fauna',
  // Climate / energy
  'watershed', 'terraformation', 'pachama', 'carbonplan', 'climateai',
  'enerparc', 'lightsource', 'greenlight', 'sunrun', 'sunnova',
  'palmetto', 'arcadia', 'octopusenergy', 'gridx', 'volterra',
  'autogrid', 'oracle-utilities', 'itron', 'landis-gyr', 'sensus',
  // Healthcare
  'commure', 'particle', 'athenahealth', 'suki', 'nabla',
  'corti', 'nuance', 'augmedix', 'sopris', 'saykara',
  'healthie', 'elation', 'hint', 'hint-health', 'spruce',
  'welkin', 'mary', 'junction', 'aster', 'medallion',
  // Social impact
  'givingwhatwecan', 'givewell', 'openphilanthropy', 'effectivealtruism',
  'malaria-consortium', 'hki', 'evidence-action', 'idinsight',
  'innovations-for-poverty-action', 'poverty-action-lab',
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
