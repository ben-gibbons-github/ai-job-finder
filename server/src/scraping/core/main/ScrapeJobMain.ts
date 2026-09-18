import ClimateBaseScraper from '../../aggregators/ClimateBase.js';
import ClimateBaseScraperV2 from '../../aggregators/ClimateBaseV2.js';
import GreenhouseScraper from '../../ats/Greenhouse.js';
import LeverScraper from '../../ats/Lever.js';
import AshbyScraper from '../../ats/Ashby.js';
import BreezyScraper from '../../ats/Breezy.js';
import BambooScraper from '../../ats/Bamboo.js';
import WorkableScraper from '../../ats/Workable.js';
import SmartRecruitersScraper from '../../ats/SmartRecruiters.js';
import BuiltInScraper from '../../builtin/BuiltIn.js';
import BuiltInGreenTechScraper from '../../builtin/BuiltInGreenTech.js';
import TerraScraper from '../../ats/Terra.js';
import EightyKHoursScraper from '../../miscScrapers/EightyKHours.js';
import RemoteOKScraper from '../../remoteok/RemoteOK.js';
import ArbeitNowScraper from '../../miscScrapers/ArbeitNow.js';
import RecruiteeScraper from '../../ats/Recruitee.js';
import RipplingScraper from '../../ats/Rippling.js';
import PersonioScraper from '../../ats/Personio.js';
import HimalayasScraper from '../../aggregators/Himalayas.js';
import WorkingNomadsScraper from '../../aggregators/WorkingNomads.js';
import MuseumScraper from '../../aggregators/Museum.js';
import HigherEdJobsScraper from '../../aggregators/HigherEdJobs.js';
import TeacherJobsScraper from '../../aggregators/TeacherJobs.js';
import WorkingAmericaJobsScraper from '../../aggregators/WorkingAmericaJobs.js';
import JobForGoodScraper from '../../impact/JobForGood.js';
import WorkForGoodScraper from '../../impact/WorkForGood.js';
import GlobalJobsScraper from '../../impact/GlobalJobs.js';
import CharityJobScraper from '../../charity/CharityJob.js';
import EnvironmentJobScraper from '../../impact/EnvironmentJob.js';
import ImpactPoolScraper from '../../impact/ImpactPool.js';
import TechJobsForGoodScraper from '../../impact/TechJobsForGood.js';
import TrellisScraper from '../../miscScrapers/Trellis.js';
import EthicalJobsScraper from '../../impact/EthicalJobs.js';
import ImpactOpportunityScraper from '../../impact/ImpactOpportunity.js';
import EscapeTheCityScraper from '../../nonprofit/EscapeTheCity.js';
import CharityPeopleScraper from '../../charity/CharityPeople.js';
import DevNetJobsStandardScraper from '../../nonprofit/DevNetJobsStandard.js';
import DevNetJobsHighlightedScraper from '../../nonprofit/DevNetJobsHighlighted.js';
import DevNetJobsHomeScraper from '../../nonprofit/DevNetJobsHome.js';
import GlobalJobsRssScraper from '../../impact/GlobalJobsRSS.js';
import RemoteCoRssScraper from '../../aggregators/RemoteCoRSS.js';
import JobicyRssScraper from '../../aggregators/JobicyRSS.js';
import DynamiteJobsRssScraper from '../../aggregators/DynamiteJobsRSS.js';
import CharityVolunteerJobsScraper from '../../charity/CharityVolunteerJobs.js';
import CharityVillageScraper from '../../charity/CharityVillage.js';
import IdealistNonprofitJobsScraper from '../../nonprofit/IdealistNonprofitJobs.js';
import IdealistVolunteerOpportunitiesScraper from '../../nonprofit/IdealistVolunteerOpportunities.js';
import ArtsJobsScraper from '../../aggregators/ArtsJobs.js';
import WeWorkRemotelyDesignScraper from '../../weworkremotely/WeWorkRemotelyDesign.js';
import CharityJobCreativeScraper from '../../charity/CharityJobCreative.js';
import WeWorkRemotelyProgrammingScraper from '../../weworkremotely/WeWorkRemotelyProgramming.js';
import WeWorkRemotelyCustomerSupportScraper from '../../weworkremotely/WeWorkRemotelyCustomerSupport.js';
import WeWorkRemotelyProductScraper from '../../weworkremotely/WeWorkRemotelyProduct.js';
import WeWorkRemotelySalesMarketingScraper from '../../weworkremotely/WeWorkRemotelySalesMarketing.js';
import WeWorkRemotelyBusinessManagementScraper from '../../weworkremotely/WeWorkRemotelyBusinessManagement.js';
import WeWorkRemotelyCopywritingScraper from '../../weworkremotely/WeWorkRemotelyCopywriting.js';
import WeWorkRemotelyAllOtherScraper from '../../weworkremotely/WeWorkRemotelyAllOther.js';
import RemoteOKDeveloperScraper from '../../remoteok/RemoteOKDeveloper.js';
import RemoteOKSupportScraper from '../../remoteok/RemoteOKSupport.js';
import RemoteOKMarketingScraper from '../../remoteok/RemoteOKMarketing.js';
import RemoteOKDesignScraper from '../../remoteok/RemoteOKDesign.js';
import RemoteOKProductScraper from '../../remoteok/RemoteOKProduct.js';
import RemoteOKDataScraper from '../../remoteok/RemoteOKData.js';
import RemoteOKSalesScraper from '../../remoteok/RemoteOKSales.js';
import RemoteOKFinanceScraper from '../../remoteok/RemoteOKFinance.js';
import RemoteOKHRScraper from '../../remoteok/RemoteOKHR.js';
import RemoteOKLegalScraper from '../../remoteok/RemoteOKLegal.js';
import RemoteOKOperationsScraper from '../../remoteok/RemoteOKOperations.js';
import RemoteOKWritingScraper from '../../remoteok/RemoteOKWriting.js';
import RemoteOKEducationScraper from '../../remoteok/RemoteOKEducation.js';
import HealthECareersScraper from '../../healthcare/HealthECareers.js';
import JMIRCareersScraper from '../../healthcare/JMIRCareers.js';
import APHACareersScraper from '../../healthcare/APHACareers.js';
import PhysicsTodayMedicalImagingScraper from '../../healthcare/PhysicsTodayMedicalImaging.js';
import RSNACareerConnectScraper from '../../healthcare/RSNACareerConnect.js';
import ASHPCareerPharmScraper from '../../healthcare/ASHPCareerPharm.js';
import ACCCareerCenterScraper from '../../healthcare/ACCCareerCenter.js';
import MedDeviceJobsScraper from '../../healthcare/MedDeviceJobs.js';
import BioTalentJobsScraper from '../../biospace/BioTalentJobs.js';
import BioSpaceRssScraper from '../../biospace/BioSpaceRSS.js';
import BioSpaceDataRssScraper from '../../biospace/BioSpaceDataRSS.js';
import BioSpaceEngineerRssScraper from '../../biospace/BioSpaceEngineerRSS.js';
import BioSpaceSoftwareRssScraper from '../../biospace/BioSpaceSoftwareRSS.js';
import PharmiwebRssScraper from '../../pharmiweb/PharmiwebRSS.js';
import APICCareersScraper from '../../healthcare/APICCareers.js';
import FACSSurgeryCareerConnectionScraper from '../../healthcare/FACSSurgeryCareerConnection.js';
import BuiltInHealthTechScraper from '../../builtin/BuiltInHealthTech.js';
import BuiltInSocialImpactScraper from '../../builtin/BuiltInSocialImpact.js';
import PharmiwebSoftwareRssScraper from '../../pharmiweb/PharmiwebSoftwareRSS.js';
import PharmiwebEngineerRssScraper from '../../pharmiweb/PharmiwebEngineerRSS.js';
import PharmiwebDataRssScraper from '../../pharmiweb/PharmiwebDataRSS.js';
import RemotiveScraper from '../../aggregators/Remotive.js';
import TheMuseScraper from '../../aggregators/TheMuse.js';
import GeneralistIndeedRssScraper from '../../miscScrapers/GeneralistIndeedRSS.js';
import GeneralistCraigslistRssScraper from '../../miscScrapers/GeneralistCraigslistRSS.js';
import UsaJobsScraper from '../../aggregators/USAJobs.js';
import AdzunaScraper from '../../aggregators/Adzuna.js';
import JoobleScraper from '../../aggregators/Jooble.js';
import JoobleV2Scraper from '../../aggregators/JoobleV2.js';
import ReedScraper from '../../aggregators/Reed.js';
import JSearchScraper from '../../aggregators/JSearch.js';
import LinkedInJobsScraper from '../../aggregators/LinkedInJobs.js';
import GetOnBoardScraper from '../../aggregators/GetOnBoard.js';
import ArtJobsScraper from '../../aggregators/ArtJobs.js';
import TradeJobsScraper from '../../miscScrapers/TradeJobs.js';
import MedicalJobsScraper from '../../healthcare/MedicalJobs.js';
import WorkdayScraper from '../../ats/Workday.js';
import ICimsScraper from '../../ats/ICims.js';
import TheirStackScraper from '../../aggregators/TheirStack.js';
import scrapedEmployerCache from '../ScrapedEmployerCache.js';
import { logScrapeQualityFlags } from '../ScrapeJobAudit.js';
import { startBackgroundAiEnrichmentJobs } from '../../../utils/BackgroundAiEnrichment.js';
import { startBackgroundGeocodeJobs } from '../../../utils/BackgroundGeocode.js';
import {
  loadComponentJobs,
  readCachesNeedUpdatingRequests,
  resolveCacheRefreshTargets,
  writeCachesNeedUpdatingRequests,
} from '../ScrapeJobCacheNeedUpdating.js';
import {
  ensureCacheDir,
  getFreshCacheAge,
  readAnyCache,
  writeCache,
} from '../../db/ScrapedJobsDb.js';
import { installScraperHttpCache, isRateLimitedScrapeError } from '../httpCache/ScraperHttpCache.js';
import {
  buildScrapeLoadDebugStats,
  recordScraperCompletion,
  recordFreshCacheAge,
  recordScraperNewJobs,
  recordScraperRateLimit,
  resetScrapeDebugTelemetry,
  type ScrapeLoadDebugStats,
} from '../ScrapeDebugTelemetry.js';
import { sanitizeJobDescription } from '../ScrapeDescriptionUtils.js';
import type { ScrapedJob } from '../ScrapedJob.js';
import type { ScrapedEmployer } from '../ScrapedEmployer.js';
import type { ScraperComponent } from '../ScrapeJobCacheNeedUpdating.js';
import { mergeJobsForCache } from '../ScrapeJobCacheNeedUpdating.js';
import {
  logScraperEnvDiagnostics,
  normalizeEmployerName,
  persistJobTypeClassificationsBySource,
  shouldRunBackgroundAiInCurrentEnvironment as shouldRunBackgroundAiInCurrentEnv,
  shouldRunBackgroundGeocodeInCurrentEnv,
  shouldScrapeInCurrentEnv,
} from './scrapeRuntime.js';
import type { ScrapeJobsOptions, ScrapeJobsProgress } from './scrapeTypes.js';

const SCRAPER_COMPONENTS: ScraperComponent[] = [
  {
    name: 'ClimateBase',
    scrapeJobs: () => new ClimateBaseScraperV2().scrapeJobs(),
  },
  {
    name: 'TheirStack',
    scrapeJobs: () => new TheirStackScraper().scrapeJobs(),
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
    name: 'Recruitee',
    scrapeJobs: () => new RecruiteeScraper().scrapeJobs(),
  },
  {
    name: 'Rippling',
    scrapeJobs: () => new RipplingScraper().scrapeJobs(),
  },
  {
    name: 'Personio',
    scrapeJobs: () => new PersonioScraper().scrapeJobs(),
  },
  {
    name: 'Himalayas',
    scrapeJobs: () => new HimalayasScraper().scrapeJobs(),
  },
  {
    name: 'WorkingNomads',
    scrapeJobs: () => new WorkingNomadsScraper().scrapeJobs(),
  },
  {
    name: 'Museum',
    scrapeJobs: () => new MuseumScraper().scrapeJobs(),
  },
  {
    name: 'HigherEdJobs',
    scrapeJobs: () => new HigherEdJobsScraper().scrapeJobs(),
  },
  {
    name: 'TeacherJobs',
    scrapeJobs: () => new TeacherJobsScraper().scrapeJobs(),
  },
  {
    name: 'WorkingAmericaJobs',
    scrapeJobs: () => new WorkingAmericaJobsScraper().scrapeJobs(),
  },
  {
    name: 'JobForGood',
    scrapeJobs: () => new JobForGoodScraper().scrapeJobs(),
  },
  {
    name: 'WorkForGood',
    scrapeJobs: () => new WorkForGoodScraper().scrapeJobs(),
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
    name: 'WeWorkRemotelyBusinessManagement',
    scrapeJobs: () => new WeWorkRemotelyBusinessManagementScraper().scrapeJobs(),
  },
  {
    name: 'WeWorkRemotelyCopywriting',
    scrapeJobs: () => new WeWorkRemotelyCopywritingScraper().scrapeJobs(),
  },
  {
    name: 'WeWorkRemotelyAllOther',
    scrapeJobs: () => new WeWorkRemotelyAllOtherScraper().scrapeJobs(),
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
    name: 'JoobleV2',
    scrapeJobs: () => new JoobleV2Scraper().scrapeJobs(),
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
    name: 'GetOnBoard',
    scrapeJobs: () => new GetOnBoardScraper().scrapeJobs(),
  },
  {
    name: 'ArtJobs',
    scrapeJobs: () => new ArtJobsScraper().scrapeJobs(),
  },
  {
    name: 'TradeJobs',
    scrapeJobs: () => new TradeJobsScraper().scrapeJobs(),
  },
  {
    name: 'MedicalJobs',
    scrapeJobs: () => new MedicalJobsScraper().scrapeJobs(),
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

export async function scrapeJobsMain(options: ScrapeJobsOptions = {}): Promise<{ jobs: ScrapedJob[]; scrapeLoadDebugStats: ScrapeLoadDebugStats }> {
  resetScrapeDebugTelemetry();
  const restoreGlobalFetch = installScraperHttpCache();
  const jobs: ScrapedJob[] = [];
  const scrapingEnabled = shouldScrapeInCurrentEnv();
  let lastCheckpointAtMs = Date.now();
  const jobsByComponent = new Map<string, ScrapedJob[]>();
  const partialScrapedJobsByComponent = new Map<string, ScrapedJob[]>();
  const existingJobsByComponent = new Map<string, ScrapedJob[] | null>();
  const dirtySinceLastCheckpoint = new Set<string>();

  const rebuildMainJobPool = (): void => {
    jobs.length = 0;
    for (const componentJobs of jobsByComponent.values()) {
      for (const job of componentJobs) {
        jobs.push(job);
      }
    }
  };

  // Only components changed since the last checkpoint get written; this avoids
  // repeatedly rewriting already-flushed components' full job sets on every tick.
  const saveScrapeCheckpoint = async (reason: string): Promise<void> => {
    if (!scrapingEnabled || dirtySinceLastCheckpoint.size === 0) {
      return;
    }

    const dirtySources = Array.from(dirtySinceLastCheckpoint);
    console.log(`[ScrapeCheckpoint] Saving ${dirtySources.length} changed source(s), reason=${reason}`);
    for (const source of dirtySources) {
      const sourceJobs = jobsByComponent.get(source);
      if (sourceJobs && sourceJobs.length > 0) {
        await writeCache(source, sourceJobs);
      }
    }
    dirtySinceLastCheckpoint.clear();
    lastCheckpointAtMs = Date.now();
  };

  try {
    console.log('Starting job scraping...');
    logScraperEnvDiagnostics();

    await ensureCacheDir();

    const requestedUpdates = await readCachesNeedUpdatingRequests();
    const { refreshTargets, unknownTargets } = resolveCacheRefreshTargets(requestedUpdates, SCRAPER_COMPONENTS);
    const refreshedTargets = new Set<string>();
    let newJobsScrapedCount = 0;

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
        const { jobs: componentJobs, refreshedFromSource, newJobsCount } = await loadComponentJobs(component, {
          scrapingEnabled,
          forceRefreshFromSource: shouldForceRefresh,
          onPageJobs: component.name === 'Adzuna'
            ? async (pageJobs) => {
                const partialJobs = partialScrapedJobsByComponent.get(component.name) ?? [];
                partialScrapedJobsByComponent.set(component.name, mergeJobsForCache(partialJobs, pageJobs, component.name));
                const existingJobs = existingJobsByComponent.has(component.name)
                  ? existingJobsByComponent.get(component.name)
                  : await readAnyCache(component.name);
                existingJobsByComponent.set(component.name, existingJobs ?? null);
                const mergedJobs = mergeJobsForCache(
                  partialScrapedJobsByComponent.get(component.name) ?? [],
                  existingJobs ?? [],
                  component.name,
                );
                jobsByComponent.set(component.name, mergedJobs);
                rebuildMainJobPool();
                dirtySinceLastCheckpoint.add(component.name);

                if (Date.now() - lastCheckpointAtMs >= 60_000) {
                  await saveScrapeCheckpoint('60-second page checkpoint');
                }
              }
            : undefined,
        });

        if (!refreshedFromSource && !shouldForceRefresh) {
          const cacheAge = getFreshCacheAge(component.name);
          if (cacheAge) {
            recordFreshCacheAge(component.name, cacheAge.ageMs, cacheAge.refreshInMs);
          }
        }

        newJobsScrapedCount += newJobsCount;
        recordScraperNewJobs(component.name, newJobsCount);

        if (shouldForceRefresh && refreshedFromSource) {
          refreshedTargets.add(component.name);
        }

        for (const componentJob of componentJobs) {
          componentJob.name = sanitizeJobDescription(componentJob.name);
          componentJob.description = sanitizeJobDescription(componentJob.description);
        }
        jobsByComponent.set(component.name, componentJobs);
        rebuildMainJobPool();
        dirtySinceLastCheckpoint.add(component.name);

        options.onProgress?.({
          jobs: jobs.slice(),
          scrapeLoadDebugStats: buildScrapeLoadDebugStats(jobs),
        });

        if (Date.now() - lastCheckpointAtMs >= 30_000) {
          await saveScrapeCheckpoint('30-second timer');
        }
      } catch (error) {
        if (isRateLimitedScrapeError(error)) {
          recordScraperRateLimit(component.name);
          console.warn(
            `[Scraper] Rate limited while scraping ${component.name} (${error.status}) on ${error.method} ${error.url}. Skipping to next source.`,
          );
          continue;
        }

        throw error;
      } finally {
        recordScraperCompletion(component.name);
        const durationMs = Date.now() - startedAtMs;
        console.log(`[Scraper] Exit ${component.name} (${durationMs}ms)`);
      }
    }

    await saveScrapeCheckpoint('scrape complete');

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

    await persistJobTypeClassificationsBySource(dedupedJobs);

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

    const scrapeLoadDebugStats = buildScrapeLoadDebugStats(dedupedJobs);

    for (const summary of scrapeLoadDebugStats.scraperSummaries ?? []) {
      console.log(
        `[ScrapeSourceSummary] source=${summary.label} stopReason=${JSON.stringify(summary.stopReason)} rateLimited=${summary.rateLimited} newJobs=${summary.newJobs} newPages=${summary.newPages} cachedPages=${summary.cachedPages} alreadyInDatabase=${summary.alreadyInDatabase}${summary.cacheAgeMs === undefined ? '' : ` cacheAgeMs=${summary.cacheAgeMs} refreshInMs=${summary.cacheRefreshInMs}`}`,
      );
    }

    if (scrapingEnabled) {
      console.log(`[ScrapeSummary] New jobs scraped from sources: ${newJobsScrapedCount}`);
    }

    console.log(
      [
        '[ScrapeDebug]',
        `jobs cache=${scrapeLoadDebugStats.jobsFromCacheCount} (${scrapeLoadDebugStats.jobsFromCachePct.toFixed(1)}%)`,
        `source=${scrapeLoadDebugStats.jobsFromSourceCount} (${scrapeLoadDebugStats.jobsFromSourcePct.toFixed(1)}%)`,
        `url-cache hit=${scrapeLoadDebugStats.urlCache.hits} (${scrapeLoadDebugStats.urlCache.hitPct.toFixed(1)}%)`,
        `miss=${scrapeLoadDebugStats.urlCache.misses} (${scrapeLoadDebugStats.urlCache.missPct.toFixed(1)}%)`,
      ].join(' '),
    );

    console.log(`Total jobs collected: ${dedupedJobs.length} from ${uniqueEmployers.size} unique employers`)
    return { jobs: dedupedJobs, scrapeLoadDebugStats };
  } finally {
    restoreGlobalFetch();
  }
}
