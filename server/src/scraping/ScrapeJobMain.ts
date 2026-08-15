import ClimateBaseScraper from './ClimateBase.js';
import GreenhouseScraper from './Greenhouse.js';
import LeverScraper from './Lever.js';
import AshbyScraper from './Ashby.js';
import BreezyScraper from './Breezy.js';
import BambooScraper from './Bamboo.js';
import WorkableScraper from './Workable.js';
import SmartRecruitersScraper from './SmartRecruiters.js';
import BuiltInScraper from './BuiltIn.js';
import BuiltInGreenTechScraper from './BuiltInGreenTech.js';
import TerraScraper from './Terra.js';
import EightyKHoursScraper from './EightyKHours.js';
import RemoteOKScraper from './RemoteOK.js';
import ArbeitNowScraper from './ArbeitNow.js';
import MuseumScraper from './Museum.js';
import JobForGoodScraper from './JobForGood.js';
import GlobalJobsScraper from './GlobalJobs.js';
import CharityJobScraper from './CharityJob.js';
import EnvironmentJobScraper from './EnvironmentJob.js';
import ImpactPoolScraper from './ImpactPool.js';
import TechJobsForGoodScraper from './TechJobsForGood.js';
import TrellisScraper from './Trellis.js';
import EthicalJobsScraper from './EthicalJobs.js';
import ImpactOpportunityScraper from './ImpactOpportunity.js';
import EscapeTheCityScraper from './EscapeTheCity.js';
import CharityPeopleScraper from './CharityPeople.js';
import DevNetJobsStandardScraper from './DevNetJobsStandard.js';
import DevNetJobsHighlightedScraper from './DevNetJobsHighlighted.js';
import DevNetJobsHomeScraper from './DevNetJobsHome.js';
import GlobalJobsRssScraper from './GlobalJobsRSS.js';
import RemoteCoRssScraper from './RemoteCoRSS.js';
import JobicyRssScraper from './JobicyRSS.js';
import DynamiteJobsRssScraper from './DynamiteJobsRSS.js';
import CharityVolunteerJobsScraper from './CharityVolunteerJobs.js';
import CharityVillageScraper from './CharityVillage.js';
import IdealistNonprofitJobsScraper from './IdealistNonprofitJobs.js';
import IdealistVolunteerOpportunitiesScraper from './IdealistVolunteerOpportunities.js';
import ArtsJobsScraper from './ArtsJobs.js';
import WeWorkRemotelyDesignScraper from './WeWorkRemotelyDesign.js';
import CharityJobCreativeScraper from './CharityJobCreative.js';
import WeWorkRemotelyProgrammingScraper from './WeWorkRemotelyProgramming.js';
import WeWorkRemotelyCustomerSupportScraper from './WeWorkRemotelyCustomerSupport.js';
import WeWorkRemotelyProductScraper from './WeWorkRemotelyProduct.js';
import WeWorkRemotelySalesMarketingScraper from './WeWorkRemotelySalesMarketing.js';
import RemoteOKDeveloperScraper from './RemoteOKDeveloper.js';
import RemoteOKSupportScraper from './RemoteOKSupport.js';
import RemoteOKMarketingScraper from './RemoteOKMarketing.js';
import RemoteOKDesignScraper from './RemoteOKDesign.js';
import RemoteOKProductScraper from './RemoteOKProduct.js';
import RemoteOKDataScraper from './RemoteOKData.js';
import RemoteOKSalesScraper from './RemoteOKSales.js';
import RemoteOKFinanceScraper from './RemoteOKFinance.js';
import RemoteOKHRScraper from './RemoteOKHR.js';
import RemoteOKLegalScraper from './RemoteOKLegal.js';
import RemoteOKOperationsScraper from './RemoteOKOperations.js';
import RemoteOKWritingScraper from './RemoteOKWriting.js';
import RemoteOKEducationScraper from './RemoteOKEducation.js';
import HealthECareersScraper from './HealthECareers.js';
import JMIRCareersScraper from './JMIRCareers.js';
import APHACareersScraper from './APHACareers.js';
import PhysicsTodayMedicalImagingScraper from './PhysicsTodayMedicalImaging.js';
import RSNACareerConnectScraper from './RSNACareerConnect.js';
import ASHPCareerPharmScraper from './ASHPCareerPharm.js';
import ACCCareerCenterScraper from './ACCCareerCenter.js';
import MedDeviceJobsScraper from './MedDeviceJobs.js';
import BioTalentJobsScraper from './BioTalentJobs.js';
import BioSpaceRssScraper from './BioSpaceRSS.js';
import BioSpaceDataRssScraper from './BioSpaceDataRSS.js';
import BioSpaceEngineerRssScraper from './BioSpaceEngineerRSS.js';
import BioSpaceSoftwareRssScraper from './BioSpaceSoftwareRSS.js';
import PharmiwebRssScraper from './PharmiwebRSS.js';
import APICCareersScraper from './APICCareers.js';
import FACSSurgeryCareerConnectionScraper from './FACSSurgeryCareerConnection.js';
import BuiltInHealthTechScraper from './BuiltInHealthTech.js';
import BuiltInSocialImpactScraper from './BuiltInSocialImpact.js';
import PharmiwebSoftwareRssScraper from './PharmiwebSoftwareRSS.js';
import PharmiwebEngineerRssScraper from './PharmiwebEngineerRSS.js';
import PharmiwebDataRssScraper from './PharmiwebDataRSS.js';
import RemotiveScraper from './Remotive.js';
import TheMuseScraper from './TheMuse.js';
import GeneralistIndeedRssScraper from './GeneralistIndeedRSS.js';
import GeneralistCraigslistRssScraper from './GeneralistCraigslistRSS.js';
import UsaJobsScraper from './USAJobs.js';
import AdzunaScraper from './Adzuna.js';
import JoobleScraper from './Jooble.js';
import ReedScraper from './Reed.js';
import JSearchScraper from './JSearch.js';
import LinkedInJobsScraper from './LinkedInJobs.js';
import WorkdayScraper from './Workday.js';
import ICimsScraper from './ICims.js';
import scrapedEmployerCache from './ScrapedEmployerCache.js';
import { gatherLegacyAIData } from './GatherLegacyAIData.js';
import { logScrapeQualityFlags } from './ScrapeJobAudit.js';
import { startBackgroundAiEnrichmentJobs } from '../utils/BackgroundAiEnrichment.js';
import { startBackgroundGeocodeJobs } from '../utils/BackgroundGeocode.js';
import {
  loadComponentJobs,
  readCachesNeedUpdatingRequests,
  resolveCacheRefreshTargets,
  writeCachesNeedUpdatingRequests,
} from './ScrapeJobCacheNeedUpdating.js';
import {
  ensureCacheDir,
} from './ScrapingCache.js';

import type { ScrapedJob } from './ScrapedJob.js';
import type { ScrapedEmployer } from './ScrapedEmployer.js';
import type { ScraperComponent } from './ScrapeJobCacheNeedUpdating.js';

const SCRAPE_JOBS_ON_PRODUCTION = true;
const SCRAPE_JOBS_ON_DEV = true;
const BACKGROUND_AI_ON_PRODUCTION = false;
const BACKGROUND_AI_ON_DEV = true;

function isCacheOnlyModeEnabled(): boolean {
  return process.env.CACHE_ONLY_SCRAPING === '1' || process.env.CACHE_ONLY_SCRAPING === 'true';
}

function shouldRunBackgroundGeocodeInCurrentEnv(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function shouldRunBackgroundAiInCurrentEnv(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? BACKGROUND_AI_ON_PRODUCTION : BACKGROUND_AI_ON_DEV;
}

function shouldScrapeInCurrentEnv(): boolean {
  if (isCacheOnlyModeEnabled()) {
    return false;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? SCRAPE_JOBS_ON_PRODUCTION : SCRAPE_JOBS_ON_DEV;
}

function normalizeEmployerName(name: string | undefined | null): string {
  return String(name ?? '').trim().toLowerCase();
}

function summarizeCsvEnv(name: string, fallbackValues: string[] = []): string {
  const rawValue = process.env[name];
  const parsedValues = (rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

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

function logScraperEnvDiagnostics(): void {
  const diagnostics = [
    `NODE_ENV=${process.env.NODE_ENV || 'unset'}`,
    `CACHE_SEED_MODE=${process.env.CACHE_SEED_MODE || 'unset'}`,
    `CACHE_ONLY_SCRAPING=${process.env.CACHE_ONLY_SCRAPING || 'unset'}`,
    summarizeSecret('CLIMATEBASE_ALGOLIA_API_KEY'),
    summarizeSecret('ESCAPE_THE_CITY_ALGOLIA_API_KEY'),
    summarizeSecret('EIGHTYK_HOURS_ALGOLIA_API_KEY'),
    summarizeSecret('GEOAPIFY_API_KEY'),
    summarizeSecret('MAPQUEST_API_KEY'),
    summarizeCsvEnv('INDEED_RSS_QUERIES', ['customer service', 'administrative assistant', 'warehouse associate', 'retail manager', 'sales representative']),
    summarizeCsvEnv('INDEED_RSS_LOCATIONS', ['United States', 'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX']),
    summarizeCsvEnv('CRAIGSLIST_AREAS', ['newyork', 'losangeles', 'chicago', 'dallas', 'houston']),
    summarizeCsvEnv('CRAIGSLIST_CATEGORIES', ['jjj']),
    summarizeSecret('USAJOBS_API_KEY'),
    summarizeCsvEnv('USAJOBS_KEYWORDS', ['nurse', 'teacher', 'human resources', 'accountant', 'administrative']),
    summarizeSecret('ADZUNA_APP_ID'),
    summarizeSecret('ADZUNA_APP_KEY'),
    summarizeCsvEnv('ADZUNA_COUNTRIES', ['us', 'gb', 'ca', 'au']),
    `ADZUNA_REQUEST_DELAY_MS=${process.env.ADZUNA_REQUEST_DELAY_MS || 'unset(default 400)'}`,
    `ADZUNA_RATE_LIMIT_COOLDOWN_MS=${process.env.ADZUNA_RATE_LIMIT_COOLDOWN_MS || 'unset(default 600000)'}`,
    summarizeSecret('JOOBLE_API_KEY'),
    summarizeCsvEnv('JOOBLE_LOCATIONS', ['United States', 'Remote']),
    summarizeSecret('REED_API_KEY'),
    summarizeCsvEnv('REED_LOCATIONS', ['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol']),
    summarizeCsvEnv('ASHBY_FEED_ENDPOINTS'),
    summarizeCsvEnv('ASHBY_ORGS', ['openai', 'anthropic', 'stripe', 'notion', 'ramp']),
    summarizeCsvEnv('GREENHOUSE_BOARDS', ['stripe', 'airbnb', 'asana', 'affirm', 'brex']),
    summarizeCsvEnv('LEVER_BOARDS', ['palantir', 'anduril', 'calendly', 'figma', 'gusto']),
    summarizeCsvEnv('WORKABLE_FEED_ENDPOINTS'),
    summarizeCsvEnv('SMARTRECRUITERS_FEED_ENDPOINTS'),
    summarizeCsvEnv('TERRA_FALLBACK_QUERIES', ['software', 'engineer', 'analyst', 'policy', 'operations']),
    `TERRA_FALLBACK_MAX_PAGES=${process.env.TERRA_FALLBACK_MAX_PAGES || 'unset(default)'}`,
  ];

  console.log(`[ScrapeEnv] ${diagnostics.join(' | ')}`);
}

const SCRAPER_COMPONENTS: ScraperComponent[] = [
  {
    name: 'ClimateBase',
    scrapeJobs: () => new ClimateBaseScraper().scrapeJobs(),
  },
  {
    name: 'Greenhouse',
    scrapeJobs: () => new GreenhouseScraper().scrapeJobs(),
  },
  {
    name: 'Lever',
    scrapeJobs: () => new LeverScraper().scrapeJobs(),
  },
  {
    name: 'Ashby',
    scrapeJobs: () => new AshbyScraper().scrapeJobs(),
  },
  {
    name: 'Breezy',
    scrapeJobs: () => new BreezyScraper().scrapeJobs(),
  },
  {
    name: 'Bamboo',
    scrapeJobs: () => new BambooScraper().scrapeJobs(),
  },
  {
    name: 'Workable',
    scrapeJobs: () => new WorkableScraper().scrapeJobs(),
  },
  {
    name: 'SmartRecruiters',
    scrapeJobs: () => new SmartRecruitersScraper().scrapeJobs(),
  },
  {
    name: 'BuiltIn',
    scrapeJobs: () => new BuiltInScraper().scrapeJobs(),
  },
  {
    name: 'BuiltInGreenTech',
    scrapeJobs: () => new BuiltInGreenTechScraper().scrapeJobs(),
  },
  {
    name: 'Terra',
    scrapeJobs: () => new TerraScraper().scrapeJobs(),
  },
  {
    name: '80kHours',
    scrapeJobs: () => new EightyKHoursScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOK',
    scrapeJobs: () => new RemoteOKScraper().scrapeJobs(),
  },
  {
    name: 'ArbeitNow',
    scrapeJobs: () => new ArbeitNowScraper().scrapeJobs(),
  },
  {
    name: 'Museum',
    scrapeJobs: () => new MuseumScraper().scrapeJobs(),
  },
  {
    name: 'JobForGood',
    scrapeJobs: () => new JobForGoodScraper().scrapeJobs(),
  },
  {
    name: 'GlobalJobs',
    scrapeJobs: () => new GlobalJobsScraper().scrapeJobs(),
  },
  {
    name: 'CharityJob',
    scrapeJobs: () => new CharityJobScraper().scrapeJobs(),
  },
  {
    name: 'EnvironmentJob',
    scrapeJobs: () => new EnvironmentJobScraper().scrapeJobs(),
  },
  {
    name: 'ImpactPool',
    scrapeJobs: () => new ImpactPoolScraper().scrapeJobs(),
  },
  {
    name: 'TechJobsForGood',
    scrapeJobs: () => new TechJobsForGoodScraper().scrapeJobs(),
  },
  {
    name: 'Trellis',
    scrapeJobs: () => new TrellisScraper().scrapeJobs(),
  },
  {
    name: 'EthicalJobs',
    scrapeJobs: () => new EthicalJobsScraper().scrapeJobs(),
  },
  {
    name: 'ImpactOpportunity',
    scrapeJobs: () => new ImpactOpportunityScraper().scrapeJobs(),
  },
  {
    name: 'EscapeTheCity',
    scrapeJobs: () => new EscapeTheCityScraper().scrapeJobs(),
  },
  {
    name: 'CharityPeople',
    scrapeJobs: () => new CharityPeopleScraper().scrapeJobs(),
  },
  {
    name: 'DevNetJobsStandard',
    scrapeJobs: () => new DevNetJobsStandardScraper().scrapeJobs(),
  },
  {
    name: 'DevNetJobsHighlighted',
    scrapeJobs: () => new DevNetJobsHighlightedScraper().scrapeJobs(),
  },
  {
    name: 'DevNetJobsHome',
    scrapeJobs: () => new DevNetJobsHomeScraper().scrapeJobs(),
  },
  {
    name: 'GlobalJobsRSS',
    scrapeJobs: () => new GlobalJobsRssScraper().scrapeJobs(),
  },
  {
    name: 'RemoteCoRSS',
    scrapeJobs: () => new RemoteCoRssScraper().scrapeJobs(),
  },
  {
    name: 'JobicyRSS',
    scrapeJobs: () => new JobicyRssScraper().scrapeJobs(),
  },
  {
    name: 'DynamiteJobsRSS',
    scrapeJobs: () => new DynamiteJobsRssScraper().scrapeJobs(),
  },
  {
    name: 'CharityVolunteerJobs',
    scrapeJobs: () => new CharityVolunteerJobsScraper().scrapeJobs(),
  },
  {
    name: 'CharityVillage',
    scrapeJobs: () => new CharityVillageScraper().scrapeJobs(),
  },
  {
    name: 'IdealistNonprofitJobs',
    scrapeJobs: () => new IdealistNonprofitJobsScraper().scrapeJobs(),
  },
  {
    name: 'IdealistVolunteerOpportunities',
    scrapeJobs: () => new IdealistVolunteerOpportunitiesScraper().scrapeJobs(),
  },
  {
    name: 'ArtsJobs',
    scrapeJobs: () => new ArtsJobsScraper().scrapeJobs(),
  },
  {
    name: 'WeWorkRemotelyDesign',
    scrapeJobs: () => new WeWorkRemotelyDesignScraper().scrapeJobs(),
  },
  {
    name: 'CharityJobCreative',
    scrapeJobs: () => new CharityJobCreativeScraper().scrapeJobs(),
  },
  {
    name: 'WeWorkRemotelyProgramming',
    scrapeJobs: () => new WeWorkRemotelyProgrammingScraper().scrapeJobs(),
  },
  {
    name: 'WeWorkRemotelyCustomerSupport',
    scrapeJobs: () => new WeWorkRemotelyCustomerSupportScraper().scrapeJobs(),
  },
  {
    name: 'WeWorkRemotelyProduct',
    scrapeJobs: () => new WeWorkRemotelyProductScraper().scrapeJobs(),
  },
  {
    name: 'WeWorkRemotelySalesMarketing',
    scrapeJobs: () => new WeWorkRemotelySalesMarketingScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKDeveloper',
    scrapeJobs: () => new RemoteOKDeveloperScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKSupport',
    scrapeJobs: () => new RemoteOKSupportScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKMarketing',
    scrapeJobs: () => new RemoteOKMarketingScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKDesign',
    scrapeJobs: () => new RemoteOKDesignScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKProduct',
    scrapeJobs: () => new RemoteOKProductScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKData',
    scrapeJobs: () => new RemoteOKDataScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKSales',
    scrapeJobs: () => new RemoteOKSalesScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKFinance',
    scrapeJobs: () => new RemoteOKFinanceScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKHR',
    scrapeJobs: () => new RemoteOKHRScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKLegal',
    scrapeJobs: () => new RemoteOKLegalScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKOperations',
    scrapeJobs: () => new RemoteOKOperationsScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKWriting',
    scrapeJobs: () => new RemoteOKWritingScraper().scrapeJobs(),
  },
  {
    name: 'RemoteOKEducation',
    scrapeJobs: () => new RemoteOKEducationScraper().scrapeJobs(),
  },
  {
    name: 'HealthECareers',
    scrapeJobs: () => new HealthECareersScraper().scrapeJobs(),
  },
  {
    name: 'JMIRCareers',
    scrapeJobs: () => new JMIRCareersScraper().scrapeJobs(),
  },
  {
    name: 'APHACareers',
    scrapeJobs: () => new APHACareersScraper().scrapeJobs(),
  },
  {
    name: 'PhysicsTodayMedicalImaging',
    scrapeJobs: () => new PhysicsTodayMedicalImagingScraper().scrapeJobs(),
  },
  {
    name: 'RSNACareerConnect',
    scrapeJobs: () => new RSNACareerConnectScraper().scrapeJobs(),
  },
  {
    name: 'ASHPCareerPharm',
    scrapeJobs: () => new ASHPCareerPharmScraper().scrapeJobs(),
  },
  {
    name: 'ACCCareerCenter',
    scrapeJobs: () => new ACCCareerCenterScraper().scrapeJobs(),
  },
  {
    name: 'MedDeviceJobs',
    scrapeJobs: () => new MedDeviceJobsScraper().scrapeJobs(),
  },
  {
    name: 'BioTalentJobs',
    scrapeJobs: () => new BioTalentJobsScraper().scrapeJobs(),
  },
  {
    name: 'BioSpaceRSS',
    scrapeJobs: () => new BioSpaceRssScraper().scrapeJobs(),
  },
  {
    name: 'BioSpaceDataRSS',
    scrapeJobs: () => new BioSpaceDataRssScraper().scrapeJobs(),
  },
  {
    name: 'BioSpaceEngineerRSS',
    scrapeJobs: () => new BioSpaceEngineerRssScraper().scrapeJobs(),
  },
  {
    name: 'BioSpaceSoftwareRSS',
    scrapeJobs: () => new BioSpaceSoftwareRssScraper().scrapeJobs(),
  },
  {
    name: 'PharmiwebRSS',
    scrapeJobs: () => new PharmiwebRssScraper().scrapeJobs(),
  },
  {
    name: 'APICCareers',
    scrapeJobs: () => new APICCareersScraper().scrapeJobs(),
  },
  {
    name: 'FACSSurgeryCareerConnection',
    scrapeJobs: () => new FACSSurgeryCareerConnectionScraper().scrapeJobs(),
  },
  {
    name: 'BuiltInHealthTech',
    scrapeJobs: () => new BuiltInHealthTechScraper().scrapeJobs(),
  },
  {
    name: 'BuiltInSocialImpact',
    scrapeJobs: () => new BuiltInSocialImpactScraper().scrapeJobs(),
  },
  {
    name: 'PharmiwebSoftwareRSS',
    scrapeJobs: () => new PharmiwebSoftwareRssScraper().scrapeJobs(),
  },
  {
    name: 'PharmiwebEngineerRSS',
    scrapeJobs: () => new PharmiwebEngineerRssScraper().scrapeJobs(),
  },
  {
    name: 'PharmiwebDataRSS',
    scrapeJobs: () => new PharmiwebDataRssScraper().scrapeJobs(),
  },
  {
    name: 'Remotive',
    scrapeJobs: () => new RemotiveScraper().scrapeJobs(),
  },
  {
    name: 'TheMuse',
    scrapeJobs: () => new TheMuseScraper().scrapeJobs(),
  },
  {
    name: 'GeneralistIndeedRSS',
    scrapeJobs: () => new GeneralistIndeedRssScraper().scrapeJobs(),
  },
  {
    name: 'GeneralistCraigslistRSS',
    scrapeJobs: () => new GeneralistCraigslistRssScraper().scrapeJobs(),
  },
  {
    name: 'USAJobs',
    scrapeJobs: () => new UsaJobsScraper().scrapeJobs(),
  },
  {
    name: 'Adzuna',
    scrapeJobs: () => new AdzunaScraper().scrapeJobs(),
  },
  {
    name: 'Jooble',
    scrapeJobs: () => new JoobleScraper().scrapeJobs(),
  },
  {
    name: 'Reed',
    scrapeJobs: () => new ReedScraper().scrapeJobs(),
  },
  {
    name: 'JSearch',
    scrapeJobs: () => new JSearchScraper().scrapeJobs(),
  },
  {
    name: 'LinkedInJobs',
    scrapeJobs: () => new LinkedInJobsScraper().scrapeJobs(),
  },
  {
    name: 'Workday',
    scrapeJobs: () => new WorkdayScraper().scrapeJobs(),
  },
  {
    name: 'iCIMS',
    scrapeJobs: () => new ICimsScraper().scrapeJobs(),
  },
];

export async function scrapeJobsMain() {
  const jobs: ScrapedJob[] = [];

  console.log('Starting job scraping...');
  logScraperEnvDiagnostics();

  await ensureCacheDir();

  const requestedUpdates = await readCachesNeedUpdatingRequests();
  const { refreshTargets, unknownTargets } = resolveCacheRefreshTargets(requestedUpdates, SCRAPER_COMPONENTS);
  const refreshedTargets = new Set<string>();
  const scrapingEnabled = shouldScrapeInCurrentEnv();

  if (refreshTargets.size > 0) {
    console.log(`Force-refresh requested for ${refreshTargets.size} cache(s): ${Array.from(refreshTargets).join(', ')}`);
  }

  if (unknownTargets.length > 0) {
    console.warn(
      `Ignoring unknown entries in cachesNeedUpdating.json: ${unknownTargets.join(', ')}`
    );
  }

  for (const component of SCRAPER_COMPONENTS) {
    const shouldForceRefresh = refreshTargets.has(component.name);
    const startedAtMs = Date.now();
    console.log(`[Scraper] Enter ${component.name}`);

    try {
      const { jobs: componentJobs, refreshedFromSource } = await loadComponentJobs(component, {
        scrapingEnabled,
        forceRefreshFromSource: shouldForceRefresh,
      });

      if (shouldForceRefresh && refreshedFromSource) {
        refreshedTargets.add(component.name);
      }

      for (const componentJob of componentJobs) {
        jobs.push(componentJob);
      }
    } finally {
      const durationMs = Date.now() - startedAtMs;
      console.log(`[Scraper] Exit ${component.name} (${durationMs}ms)`);
    }
  }

  if (requestedUpdates.length > 0) {
    const pendingRefreshes = Array.from(refreshTargets).filter((name) => !refreshedTargets.has(name));
    const remaining = Array.from(new Set([...pendingRefreshes, ...unknownTargets]));

    await writeCachesNeedUpdatingRequests(remaining);

    if (remaining.length === 0) {
      console.log('All requested cache refreshes completed. Cleared cachesNeedUpdating.json.');
    } else {
      console.warn(
        `Some requested cache refreshes were not completed. Remaining in cachesNeedUpdating.json: ${remaining.join(', ')}`
      );
    }
  }

  const dedupedJobs: ScrapedJob[] = [];
  const seenSourceUrls = new Set<string>();

  for (const job of jobs) {
    const sourceUrl = job.source_url?.trim();
    if (!sourceUrl) {
      dedupedJobs.push(job);
      continue;
    }

    if (seenSourceUrls.has(sourceUrl)) {
      continue;
    }

    seenSourceUrls.add(sourceUrl);
    dedupedJobs.push(job);
  }

  const removedDuplicates = jobs.length - dedupedJobs.length;
  if (removedDuplicates > 0) {
    console.log(`Removed ${removedDuplicates} duplicate jobs by source_url`);
  }

  logScrapeQualityFlags(dedupedJobs);

  if (shouldRunBackgroundGeocodeInCurrentEnv()) {
    startBackgroundGeocodeJobs(dedupedJobs);
  } else {
    console.log('[BackgroundGeocode] Skipped startup geocoding in production.');
  }

  const employerDatastore = new Map<string, ScrapedEmployer>();
  for (const cachedEmployer of scrapedEmployerCache.getAllCachedEmployers()) {
    const key = normalizeEmployerName(cachedEmployer.name);
    if (!key) {
      continue;
    }
    employerDatastore.set(key, cachedEmployer);
  }

  for (const job of dedupedJobs) {
    const employerName = String(job.company_name ?? '').trim() || 'Unknown Employer';
    const employerKey = normalizeEmployerName(employerName);
    if (!employerKey) {
      continue;
    }

    let employer = employerDatastore.get(employerKey);
    if (!employer) {
      employer = {
        name: employerName,
        ai_summary: '',
        ai_red_flag_summary: '',
        ai_score: 0,
        ai_red_flag_score: 0,
        ai_impact_summary: '',
        ai_impact_score: 0,
        employeeQualityOfLifeScore: 0,
        employeeQualityOfLifeSummary: '',
      };
      employerDatastore.set(employerKey, employer);
    }

    job.scrapedEmployer = employer;
  }

  gatherLegacyAIData(dedupedJobs, employerDatastore);

  scrapedEmployerCache.setCachedEmployers(Array.from(employerDatastore.values()));

  const employers = Array.from(employerDatastore.values());
  const totalEmployers = employers.length;

  const hasAuditData = (employer: ScrapedEmployer): boolean =>
    employer.ai_score > 0 ||
    employer.ai_red_flag_score > 0 ||
    String(employer.ai_summary ?? '').trim().length > 0 ||
    String(employer.ai_red_flag_summary ?? '').trim().length > 0;

  const hasImpactData = (employer: ScrapedEmployer): boolean =>
    employer.ai_impact_score > 0 || String(employer.ai_impact_summary ?? '').trim().length > 0;

  const hasQualityOfLifeData = (employer: ScrapedEmployer): boolean =>
    employer.employeeQualityOfLifeScore > 0 ||
    String(employer.employeeQualityOfLifeSummary ?? '').trim().length > 0;

  let auditEmployerCount = 0;
  let impactEmployerCount = 0;
  let qualityOfLifeEmployerCount = 0;
  for (const employer of employers) {
    if (hasAuditData(employer)) {
      auditEmployerCount += 1;
    }
    if (hasImpactData(employer)) {
      impactEmployerCount += 1;
    }
    if (hasQualityOfLifeData(employer)) {
      qualityOfLifeEmployerCount += 1;
    }
  }

  const toPercent = (count: number): string => {
    if (totalEmployers === 0) {
      return '0.0';
    }
    return ((count / totalEmployers) * 100).toFixed(1);
  };

  console.log(
    [
      'Employer AI data coverage after load:',
      `audit ${auditEmployerCount}/${totalEmployers} (${toPercent(auditEmployerCount)}%)`,
      `impact ${impactEmployerCount}/${totalEmployers} (${toPercent(impactEmployerCount)}%)`,
      `qualityOfLife ${qualityOfLifeEmployerCount}/${totalEmployers} (${toPercent(qualityOfLifeEmployerCount)}%)`,
    ].join(' ')
  );

  if (shouldRunBackgroundAiInCurrentEnv()) {
    startBackgroundAiEnrichmentJobs(dedupedJobs);
  } else {
    console.log('[BackgroundAI] Skipped startup AI enrichment in current environment.');
  }

  const uniqueEmployers = new Set<string>();
  for (const job of dedupedJobs) {
    const normalizedEmployer = String(job.company_name ?? '').trim().toLowerCase();
    if (normalizedEmployer.length > 0) {
      uniqueEmployers.add(normalizedEmployer);
    }
  }

  console.log(`Total jobs collected: ${dedupedJobs.length} from ${uniqueEmployers.size} unique employers`)
  return dedupedJobs;
}

