import { writeCache } from '../../db/ScrapedJobsDb.js';
import { ALL_SCRAPE_COUNTRY_CODES } from '../SharedCountries.js';
import { ensureJobTypeClassification } from '../../../searching/JobTypeClassify.js';
import type { ScrapedJob } from '../ScrapedJob.js';
import { isSqlOnlyCacheLoadingEnabled } from '../../../utils/SqlOnlyCacheLoading.js';

const SCRAPE_JOBS_ON_PRODUCTION = true;
const SCRAPE_JOBS_ON_DEV = true;
const BACKGROUND_AI_KICKOFF_ENABLED = process.env.BACKGROUND_AI_KICKOFF_ENABLED === '1'
  || process.env.BACKGROUND_AI_KICKOFF_ENABLED === 'true';
const BACKGROUND_AI_STARTUP_ENABLED = process.env.BACKGROUND_AI_STARTUP_ENABLED === '1'
  || process.env.BACKGROUND_AI_STARTUP_ENABLED === 'true';
const JOB_TYPE_CLASSIFICATION_ENABLED = process.env.JOB_TYPE_CLASSIFICATION_ENABLED === '1'
  || process.env.JOB_TYPE_CLASSIFICATION_ENABLED === 'true';

function isCacheOnlyModeEnabled(): boolean {
  return isSqlOnlyCacheLoadingEnabled()
    || process.env.CACHE_ONLY_SCRAPING === '1'
    || process.env.CACHE_ONLY_SCRAPING === 'true';
}

export function shouldRunBackgroundGeocodeInCurrentEnv(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export async function persistJobTypeClassificationsBySource(jobs: ScrapedJob[]): Promise<void> {
  if (!JOB_TYPE_CLASSIFICATION_ENABLED) return;

  const jobsBySource = new Map<string, ScrapedJob[]>();
  for (const job of jobs) {
    const source = String(job.source ?? '').trim();
    if (!source) continue;
    const bucket = jobsBySource.get(source);
    if (bucket) bucket.push(job);
    else jobsBySource.set(source, [job]);
  }

  for (const [source, sourceJobs] of jobsBySource) {
    let changed = false;
    for (const job of sourceJobs) {
      if (ensureJobTypeClassification(job)) changed = true;
    }
    if (changed) {
      await writeCache(source, sourceJobs);
      console.log(`[JobTypeClassify] Persisted versioned classifications for ${sourceJobs.length} jobs in ${source}`);
    }
  }
}

export function shouldRunBackgroundAiInCurrentEnvironment(): boolean {
  return BACKGROUND_AI_KICKOFF_ENABLED || BACKGROUND_AI_STARTUP_ENABLED;
}

export function shouldScrapeInCurrentEnv(): boolean {
  if (isCacheOnlyModeEnabled()) return false;
  return process.env.NODE_ENV === 'production' ? SCRAPE_JOBS_ON_PRODUCTION : SCRAPE_JOBS_ON_DEV;
}

export function normalizeEmployerName(name: string | undefined | null): string {
  return String(name ?? '').trim().toLowerCase();
}

function summarizeCsvEnv(name: string, fallbackValues: string[] = []): string {
  const parsedValues = (process.env[name] || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (parsedValues.length > 0) {
    const preview = parsedValues.slice(0, 5).join(', ');
    const suffix = parsedValues.length > 5 ? ', ...' : '';
    return `${name}=set(${parsedValues.length}) [${preview}${suffix}]`;
  }
  if (fallbackValues.length > 0) {
    return `${name}=missing -> default(${fallbackValues.length}) [${fallbackValues.slice(0, 5).join(', ')}${fallbackValues.length > 5 ? ', ...' : ''}]`;
  }
  return `${name}=missing`;
}

function summarizeSecret(name: string): string {
  return `${name}=${process.env[name] ? 'set' : 'missing'}`;
}

export function logScraperEnvDiagnostics(): void {
  const diagnostics = [
    `NODE_ENV=${process.env.NODE_ENV || 'unset'}`,
    `CACHE_SEED_MODE=${process.env.CACHE_SEED_MODE || 'unset'}`,
    `CACHE_ONLY_SCRAPING=${process.env.CACHE_ONLY_SCRAPING || 'unset'}`,
    `SQL_ONLY_CACHE_LOADING=${process.env.SQL_ONLY_CACHE_LOADING || 'unset'}`,
    `BACKGROUND_AI_KICKOFF_ENABLED=${process.env.BACKGROUND_AI_KICKOFF_ENABLED || 'unset'}`,
    `BACKGROUND_AI_STARTUP_ENABLED=${process.env.BACKGROUND_AI_STARTUP_ENABLED || 'unset'} (effective=${shouldRunBackgroundAiInCurrentEnvironment()})`,
    `JOB_TYPE_CLASSIFICATION_ENABLED=${process.env.JOB_TYPE_CLASSIFICATION_ENABLED || 'unset'} (effective=${JOB_TYPE_CLASSIFICATION_ENABLED})`,
    `LOG_NEW_SCRAPED_JOBS=${process.env.LOG_NEW_SCRAPED_JOBS || 'unset'}`,
    `LOG_SCRAPED_PAGE_COUNTS=${process.env.LOG_SCRAPED_PAGE_COUNTS || 'unset'}`,
    summarizeSecret('CLIMATEBASE_ALGOLIA_API_KEY'), summarizeSecret('ESCAPE_THE_CITY_ALGOLIA_API_KEY'),
    summarizeSecret('EIGHTYK_HOURS_ALGOLIA_API_KEY'), summarizeSecret('GEOAPIFY_API_KEY'), summarizeSecret('MAPQUEST_API_KEY'),
    summarizeCsvEnv('INDEED_RSS_QUERIES', ['customer service', 'administrative assistant', 'warehouse associate', 'retail manager', 'sales representative']),
    summarizeCsvEnv('INDEED_RSS_LOCATIONS', ['United States', 'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX']),
    summarizeCsvEnv('CRAIGSLIST_AREAS', ['newyork', 'losangeles', 'chicago', 'dallas', 'houston']), summarizeCsvEnv('CRAIGSLIST_CATEGORIES', ['jjj']),
    summarizeSecret('USAJOBS_API_KEY'), summarizeCsvEnv('USAJOBS_KEYWORDS', ['nurse', 'teacher', 'human resources', 'accountant', 'administrative']),
    summarizeSecret('ADZUNA_APP_ID'), summarizeSecret('ADZUNA_APP_KEY'), summarizeCsvEnv('ADZUNA_COUNTRIES', ALL_SCRAPE_COUNTRY_CODES),
    `ADZUNA_REQUEST_DELAY_MS=${process.env.ADZUNA_REQUEST_DELAY_MS || 'unset(default 400)'}`, `ADZUNA_RATE_LIMIT_COOLDOWN_MS=${process.env.ADZUNA_RATE_LIMIT_COOLDOWN_MS || 'unset(default 600000)'}`,
    `ADZUNA_MAX_KEYWORDS=${process.env.ADZUNA_MAX_KEYWORDS || 'unset(default 400)'}`, `ADZUNA_MAX_PAGES=${process.env.ADZUNA_MAX_PAGES || 'unset(default 30)'}`,
    summarizeSecret('JOOBLE_API_KEY'), summarizeCsvEnv('JOOBLE_LOCATIONS', ['United States', 'Remote']),
    `JOOBLE_MAX_KEYWORDS=${process.env.JOOBLE_MAX_KEYWORDS || 'unset(default 3000)'}`, `JOOBLE_MAX_LOCATIONS=${process.env.JOOBLE_MAX_LOCATIONS || 'unset(default 120)'}`, `JOOBLE_MAX_PAGES=${process.env.JOOBLE_MAX_PAGES || 'unset(default 250)'}`,
    summarizeSecret('REED_API_KEY'), summarizeCsvEnv('REED_LOCATIONS', ['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol']),
    summarizeCsvEnv('ASHBY_FEED_ENDPOINTS'), summarizeCsvEnv('ASHBY_ORGS', ['openai', 'anthropic', 'stripe', 'notion', 'ramp']),
    summarizeCsvEnv('GREENHOUSE_BOARDS', ['stripe', 'airbnb', 'asana', 'affirm', 'brex']), summarizeCsvEnv('LEVER_BOARDS', ['palantir', 'anduril', 'calendly', 'figma', 'gusto']),
    summarizeCsvEnv('RECRUITEE_BOARDS', ['bunq']), `HIMALAYAS_MAX_PAGES=${process.env.HIMALAYAS_MAX_PAGES || '20(default)'}`,
    summarizeCsvEnv('WORKABLE_FEED_ENDPOINTS'), summarizeCsvEnv('SMARTRECRUITERS_FEED_ENDPOINTS'),
    summarizeCsvEnv('TERRA_FALLBACK_QUERIES', ['software', 'engineer', 'analyst', 'policy', 'operations']), `TERRA_FALLBACK_MAX_PAGES=${process.env.TERRA_FALLBACK_MAX_PAGES || 'unset(default)'}`,
  ];
  console.log(`[ScrapeEnv] ${diagnostics.join(' | ')}`);
}
