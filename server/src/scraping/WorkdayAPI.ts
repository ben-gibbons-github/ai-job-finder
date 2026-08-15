import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

// Workday is used by hundreds of Fortune 500 and large enterprise companies.
// Each company has a unique tenant + jobSite slug.
// URL pattern: https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{jobSite}/jobs
// POST body: { "limit": 20, "offset": 0, "searchText": "", "appliedFacets": {} }

interface WorkdayBoard {
  tenant: string   // subdomain (e.g. "netflix")
  site: string     // job site name (e.g. "Netflix_External_Site")
  wdN?: string     // "wd1"|"wd3"|"wd5" — defaults to "wd5"
  name?: string    // human-readable company name (for logging)
}

const DEFAULT_WORKDAY_BOARDS: WorkdayBoard[] = [
  // ── Media / Entertainment ─────────────────────────────────────────────────
  { tenant: 'netflix', site: 'Netflix_External_Site', name: 'Netflix' },
  { tenant: 'warnerbros', site: 'WBD_External', name: 'Warner Bros Discovery' },
  { tenant: 'disney', site: 'external_career', name: 'Disney' },
  { tenant: 'sony', site: 'sonyglobal', name: 'Sony' },
  { tenant: 'nbc', site: 'NBCUniversal_External', name: 'NBCUniversal' },
  { tenant: 'viacbs', site: 'CBS_Careers', name: 'Paramount' },
  { tenant: 'spotify', site: 'Spotify_External', name: 'Spotify' },
  { tenant: 'soundcloud', site: 'SoundCloud', name: 'SoundCloud' },
  { tenant: 'iheartmedia', site: 'iHM_External_Careers', name: 'iHeartMedia' },
  // ── Technology ────────────────────────────────────────────────────────────
  { tenant: 'adobe', site: 'adobeexternalcareersite', name: 'Adobe' },
  { tenant: 'salesforce', site: 'salesforce_external', name: 'Salesforce' },
  { tenant: 'workday', site: 'workday', name: 'Workday' },
  { tenant: 'servicenow', site: 'External', name: 'ServiceNow' },
  { tenant: 'vmware', site: 'vmware', name: 'VMware' },
  { tenant: 'paloaltonetworks', site: 'PaloAltoNetworks_External', name: 'Palo Alto Networks' },
  { tenant: 'fortinet', site: 'External', name: 'Fortinet' },
  { tenant: 'zscaler', site: 'External', name: 'Zscaler' },
  { tenant: 'crowdstrike', site: 'crowdstrike-careers', name: 'CrowdStrike' },
  { tenant: 'nutanix', site: 'External', name: 'Nutanix' },
  { tenant: 'pure', site: 'purestorage', name: 'Pure Storage' },
  { tenant: 'netapp', site: 'netapp', name: 'NetApp' },
  { tenant: 'commvault', site: 'External', name: 'Commvault' },
  { tenant: 'verint', site: 'External', name: 'Verint' },
  { tenant: 'genesys', site: 'genesys', name: 'Genesys' },
  { tenant: 'nice', site: 'External', name: 'NICE' },
  { tenant: 'zendesk', site: 'External', name: 'Zendesk' },
  { tenant: 'paylocity', site: 'paylocity', name: 'Paylocity' },
  { tenant: 'informatica', site: 'INFA_Careers', name: 'Informatica' },
  { tenant: 'tibco', site: 'External', name: 'TIBCO' },
  { tenant: 'opentext', site: 'opentext', name: 'OpenText' },
  { tenant: 'veeva', site: 'veeva', name: 'Veeva Systems' },
  { tenant: 'medidata', site: 'External', name: 'Medidata' },
  { tenant: 'iqvia', site: 'iqvia', name: 'IQVIA' },
  { tenant: 'solarwinds', site: 'solarwinds', name: 'SolarWinds' },
  { tenant: 'proofpoint', site: 'External', name: 'Proofpoint' },
  { tenant: 'splunk', site: 'splunk', name: 'Splunk' },
  { tenant: 'qualys', site: 'External', name: 'Qualys' },
  { tenant: 'rapid7', site: 'External', name: 'Rapid7' },
  { tenant: 'tenable', site: 'External', name: 'Tenable' },
  { tenant: 'sailpoint', site: 'External', name: 'SailPoint' },
  { tenant: 'beyondtrust', site: 'External', name: 'BeyondTrust' },
  { tenant: 'cyberark', site: 'External', name: 'CyberArk' },
  // ── Finance / Banking ─────────────────────────────────────────────────────
  { tenant: 'blackrock', site: 'blackrock_campus', name: 'BlackRock' },
  { tenant: 'jpmorgan', site: 'jpmorgan', wdN: 'wd1', name: 'JPMorgan Chase' },
  { tenant: 'goldmansachs', site: 'Goldman_Sachs_External', name: 'Goldman Sachs' },
  { tenant: 'morganstanley', site: 'External', name: 'Morgan Stanley' },
  { tenant: 'wellsfargo', site: 'WellsFargoJobSearch', name: 'Wells Fargo' },
  { tenant: 'bankofamerica', site: 'bankofamerica', wdN: 'wd1', name: 'Bank of America' },
  { tenant: 'citigroup', site: 'Citi_Careers', name: 'Citi' },
  { tenant: 'usbank', site: 'usbank', name: 'US Bank' },
  { tenant: 'pnc', site: 'pncjobs', name: 'PNC' },
  { tenant: 'td', site: 'tdcareers', name: 'TD Bank' },
  { tenant: 'scotiabank', site: 'scotiabank', name: 'Scotiabank' },
  { tenant: 'rbc', site: 'rbcstudentcampus', name: 'RBC' },
  { tenant: 'bmo', site: 'bmo', name: 'BMO' },
  { tenant: 'capitalgroup', site: 'capitalgroup', name: 'Capital Group' },
  { tenant: 'fidelity', site: 'fidelity', name: 'Fidelity' },
  { tenant: 'vanguard', site: 'vanguard', name: 'Vanguard' },
  { tenant: 'statestreet', site: 'statestreet', name: 'State Street' },
  { tenant: 'schwab', site: 'SchwabCareers', name: 'Charles Schwab' },
  { tenant: 'ameriprise', site: 'External', name: 'Ameriprise' },
  { tenant: 'principalfinancial', site: 'principalfinancial', name: 'Principal Financial' },
  { tenant: 'lincolnfinancial', site: 'External', name: 'Lincoln Financial' },
  { tenant: 'annuities', site: 'External', name: 'Transamerica' },
  { tenant: 'allstate', site: 'allstate', name: 'Allstate' },
  { tenant: 'progressive', site: 'External', name: 'Progressive' },
  { tenant: 'nationwide', site: 'nationwide', name: 'Nationwide' },
  { tenant: 'travelers', site: 'travelers', name: 'Travelers' },
  { tenant: 'metlife', site: 'metlifeexternal', name: 'MetLife' },
  { tenant: 'prudential', site: 'prudential', name: 'Prudential' },
  { tenant: 'manulife', site: 'manulife', name: 'Manulife' },
  { tenant: 'sunlife', site: 'sunlife', name: 'Sun Life' },
  // ── Healthcare / Pharma ───────────────────────────────────────────────────
  { tenant: 'jnj', site: 'jnjus', name: 'Johnson & Johnson' },
  { tenant: 'abbott', site: 'External', name: 'Abbott' },
  { tenant: 'medtronic', site: 'medtronic', name: 'Medtronic' },
  { tenant: 'stryker', site: 'stryker', name: 'Stryker' },
  { tenant: 'zimvie', site: 'External', name: 'Zimmer Biomet' },
  { tenant: 'bdx', site: 'External', name: 'BD Becton Dickinson' },
  { tenant: 'baxter', site: 'baxter', name: 'Baxter' },
  { tenant: 'edwards', site: 'External', name: 'Edwards Lifesciences' },
  { tenant: 'abbvie', site: 'abbvie', name: 'AbbVie' },
  { tenant: 'biogen', site: 'biogen', name: 'Biogen' },
  { tenant: 'regeneron', site: 'External', name: 'Regeneron' },
  { tenant: 'gilead', site: 'gilead', name: 'Gilead Sciences' },
  { tenant: 'amgen', site: 'amgen', name: 'Amgen' },
  { tenant: 'bms', site: 'bristolmyerssquibb', name: 'Bristol-Myers Squibb' },
  { tenant: 'merck', site: 'merck', name: 'Merck' },
  { tenant: 'lilly', site: 'lilly', name: 'Eli Lilly' },
  { tenant: 'novartis', site: 'novartis', name: 'Novartis' },
  { tenant: 'roche', site: 'roche', name: 'Roche' },
  { tenant: 'sanofi', site: 'sanofi', name: 'Sanofi' },
  { tenant: 'astrazeneca', site: 'AstraZeneca', name: 'AstraZeneca' },
  { tenant: 'gsk', site: 'External', name: 'GSK' },
  { tenant: 'astellas', site: 'External', name: 'Astellas' },
  { tenant: 'takeda', site: 'takedacareers', name: 'Takeda' },
  { tenant: 'bavarian', site: 'External', name: 'BioMerieux' },
  { tenant: 'cerner', site: 'External', name: 'Oracle Health' },
  { tenant: 'epic', site: 'epiccareers', name: 'Epic Systems' },
  { tenant: 'allscripts', site: 'External', name: 'Veradigm' },
  { tenant: 'healthcatalyst', site: 'External', name: 'Health Catalyst' },
  { tenant: 'hca', site: 'hca', name: 'HCA Healthcare' },
  { tenant: 'tenethealth', site: 'External', name: 'Tenet Health' },
  { tenant: 'communityhealth', site: 'External', name: 'Community Health Systems' },
  { tenant: 'humana', site: 'humana', name: 'Humana' },
  { tenant: 'cigna', site: 'cigna', name: 'Cigna' },
  { tenant: 'aetna', site: 'aetna', name: 'Aetna' },
  { tenant: 'anthem', site: 'anthem', name: 'Anthem' },
  { tenant: 'davita', site: 'davita', name: 'DaVita' },
  { tenant: 'labcorp', site: 'labcorp', name: 'LabCorp' },
  { tenant: 'questdiagnostics', site: 'questdiagnostics', name: 'Quest Diagnostics' },
  { tenant: 'mednax', site: 'External', name: 'MEDNAX' },
  { tenant: 'team', site: 'team', name: 'TeamHealth' },
  // ── Energy / Utilities ────────────────────────────────────────────────────
  { tenant: 'shell', site: 'shell', name: 'Shell' },
  { tenant: 'bp', site: 'bp', name: 'BP' },
  { tenant: 'eog', site: 'External', name: 'EOG Resources' },
  { tenant: 'conocophillips', site: 'conocophillips', name: 'ConocoPhillips' },
  { tenant: 'nextera', site: 'nextera', name: 'NextEra Energy' },
  { tenant: 'duke', site: 'duke', name: 'Duke Energy' },
  { tenant: 'dominion', site: 'dominion', name: 'Dominion Energy' },
  { tenant: 'exelon', site: 'exelon', name: 'Exelon' },
  { tenant: 'southern', site: 'southerncompany', name: 'Southern Company' },
  { tenant: 'entergy', site: 'entergy', name: 'Entergy' },
  { tenant: 'sce', site: 'External', name: 'Southern California Edison' },
  { tenant: 'pgecorp', site: 'pgecorp', name: 'PG&E' },
  { tenant: 'eversource', site: 'External', name: 'Eversource' },
  { tenant: 'nationalgrid', site: 'nationalgrid', name: 'National Grid' },
  { tenant: 'ameren', site: 'ameren', name: 'Ameren' },
  { tenant: 'cms', site: 'cms', name: 'CMS Energy' },
  { tenant: 'dte', site: 'dte', name: 'DTE Energy' },
  { tenant: 'nrgenergy', site: 'nrg', name: 'NRG Energy' },
  { tenant: 'clearwayenergy', site: 'External', name: 'Clearway Energy' },
  { tenant: 'aes', site: 'aes', name: 'AES' },
  // ── Manufacturing / Industrial ────────────────────────────────────────────
  { tenant: 'ge', site: 'ExternalSite', wdN: 'wd1', name: 'GE' },
  { tenant: 'ge', site: 'gevernova', name: 'GE Vernova' },
  { tenant: 'honeywell', site: 'honeywell', name: 'Honeywell' },
  { tenant: 'siemens', site: 'siemens', name: 'Siemens' },
  { tenant: 'emerson', site: 'emerson', name: 'Emerson Electric' },
  { tenant: 'abb', site: 'External', name: 'ABB' },
  { tenant: 'parker', site: 'parker', name: 'Parker Hannifin' },
  { tenant: 'eaton', site: 'eaton', name: 'Eaton' },
  { tenant: 'rockwellautomation', site: 'External', name: 'Rockwell Automation' },
  { tenant: 'schneider', site: 'schneider', name: 'Schneider Electric' },
  { tenant: 'caterpillar', site: 'caterpillar', name: 'Caterpillar' },
  { tenant: 'deere', site: 'deere', name: 'John Deere' },
  { tenant: 'dow', site: 'dow', name: 'Dow' },
  { tenant: 'dupont', site: 'dupont', name: 'DuPont' },
  { tenant: 'ppg', site: 'ppg', name: 'PPG' },
  { tenant: 'praxair', site: 'External', name: 'Linde' },
  { tenant: 'airproducts', site: 'airproducts', name: 'Air Products' },
  { tenant: 'eastmanchem', site: 'External', name: 'Eastman Chemical' },
  { tenant: 'celanese', site: 'External', name: 'Celanese' },
  { tenant: '3m', site: '3m', name: '3M' },
  { tenant: 'corning', site: 'corning', name: 'Corning' },
  { tenant: 'illinois', site: 'ilw', name: 'Illinois Tool Works' },
  { tenant: 'graco', site: 'External', name: 'Graco' },
  { tenant: 'xylem', site: 'External', name: 'Xylem' },
  { tenant: 'watts', site: 'External', name: 'Watts Water' },
  { tenant: 'roper', site: 'External', name: 'Roper Technologies' },
  { tenant: 'ametek', site: 'ametek', name: 'AMETEK' },
  // ── Aerospace / Defense ───────────────────────────────────────────────────
  { tenant: 'boeing', site: 'boeing', wdN: 'wd1', name: 'Boeing' },
  { tenant: 'lockheedmartin', site: 'lockheedmartin', name: 'Lockheed Martin' },
  { tenant: 'northropgrumman', site: 'northropgrumman', name: 'Northrop Grumman' },
  { tenant: 'raytheon', site: 'rtxcorporation', name: 'RTX (Raytheon)' },
  { tenant: 'l3harris', site: 'l3harris', name: 'L3Harris' },
  { tenant: 'bae', site: 'External', name: 'BAE Systems' },
  { tenant: 'textron', site: 'textron', name: 'Textron' },
  { tenant: 'leidos', site: 'leidos', name: 'Leidos' },
  { tenant: 'saic', site: 'saic', name: 'SAIC' },
  { tenant: 'boozallen', site: 'bah', name: 'Booz Allen Hamilton' },
  // ── Consulting / Professional Services ───────────────────────────────────
  { tenant: 'deloitte', site: 'deloitte', wdN: 'wd1', name: 'Deloitte' },
  { tenant: 'pwc', site: 'pwc', name: 'PwC' },
  { tenant: 'kpmg', site: 'kpmg', name: 'KPMG' },
  { tenant: 'ey', site: 'eyus', name: 'EY' },
  { tenant: 'mckinsey', site: 'mckinsey', name: 'McKinsey' },
  { tenant: 'bcg', site: 'bcg', name: 'BCG' },
  { tenant: 'bain', site: 'bain', name: 'Bain & Company' },
  { tenant: 'accenture', site: 'accenture', name: 'Accenture' },
  { tenant: 'capgemini', site: 'capgemini', name: 'Capgemini' },
  { tenant: 'cognizant', site: 'cognizant', name: 'Cognizant' },
  { tenant: 'gartner', site: 'gartner', name: 'Gartner' },
  { tenant: 'dxc', site: 'dxc', name: 'DXC Technology' },
  { tenant: 'cgi', site: 'cgi', name: 'CGI' },
  { tenant: 'leidos', site: 'leidosinc', name: 'Leidos' },
  { tenant: 'maximus', site: 'maximus', name: 'Maximus' },
  // ── Retail / Consumer ─────────────────────────────────────────────────────
  { tenant: 'walmart', site: 'walmart', wdN: 'wd5', name: 'Walmart' },
  { tenant: 'target', site: 'target', name: 'Target' },
  { tenant: 'costco', site: 'costco', name: 'Costco' },
  { tenant: 'bestbuy', site: 'bestbuy', name: 'Best Buy' },
  { tenant: 'lowes', site: 'Lowes', name: "Lowe's" },
  { tenant: 'homedepot', site: 'ext', name: 'Home Depot' },
  { tenant: 'kroger', site: 'kroger', name: 'Kroger' },
  { tenant: 'publix', site: 'External', name: 'Publix' },
  { tenant: 'albertsons', site: 'External', name: 'Albertsons' },
  { tenant: 'heb', site: 'heb', name: 'HEB' },
  { tenant: 'wholefoodsmarket', site: 'WFM_External', name: 'Whole Foods' },
  { tenant: 'nordstrom', site: 'nordstrom', name: 'Nordstrom' },
  { tenant: 'gap', site: 'gap', name: 'Gap Inc' },
  { tenant: 'pvh', site: 'pvh', name: 'PVH Corp' },
  { tenant: 'vfc', site: 'vfc', name: 'VF Corporation' },
  { tenant: 'hanesbrands', site: 'External', name: 'HanesBrands' },
  { tenant: 'rl', site: 'External', name: 'Ralph Lauren' },
  // ── Transportation / Logistics ────────────────────────────────────────────
  { tenant: 'ups', site: 'ups', name: 'UPS' },
  { tenant: 'fedex', site: 'External', name: 'FedEx' },
  { tenant: 'cscl', site: 'External', name: 'CSX' },
  { tenant: 'union', site: 'unionpacific', name: 'Union Pacific' },
  { tenant: 'bnsf', site: 'bnsf', name: 'BNSF Railway' },
  { tenant: 'southwest', site: 'southwest', name: 'Southwest Airlines' },
  { tenant: 'united', site: 'united', name: 'United Airlines' },
  { tenant: 'deltaairlines', site: 'delta', name: 'Delta Air Lines' },
  { tenant: 'americanairlines', site: 'americanairlines', name: 'American Airlines' },
  { tenant: 'jetblue', site: 'External', name: 'JetBlue' },
  { tenant: 'alaska', site: 'alaskaairline', name: 'Alaska Airlines' },
  { tenant: 'marriott', site: 'marriott', name: 'Marriott' },
  { tenant: 'hilton', site: 'hilton', name: 'Hilton' },
  { tenant: 'hyatt', site: 'hyatt', name: 'Hyatt' },
  { tenant: 'ihg', site: 'ihg', name: 'IHG' },
  // ── Education ────────────────────────────────────────────────────────────
  { tenant: 'mit', site: 'mit', name: 'MIT' },
  { tenant: 'stanford', site: 'stanford', name: 'Stanford University' },
  { tenant: 'columbia', site: 'columbia', name: 'Columbia University' },
  { tenant: 'yale', site: 'yale', name: 'Yale University' },
  { tenant: 'princeton', site: 'princeton', name: 'Princeton University' },
  { tenant: 'chicago', site: 'universityofchicago', name: 'University of Chicago' },
  { tenant: 'northwestern', site: 'northwestern', name: 'Northwestern University' },
  { tenant: 'duke', site: 'dukeuniv', name: 'Duke University' },
  { tenant: 'vanderbilt', site: 'vanderbilt', name: 'Vanderbilt University' },
  { tenant: 'emory', site: 'emory', name: 'Emory University' },
  { tenant: 'gwu', site: 'gwu', name: 'George Washington University' },
  { tenant: 'american', site: 'american', name: 'American University' },
  { tenant: 'arizona', site: 'arizona', name: 'University of Arizona' },
  { tenant: 'calstate', site: 'calstate', name: 'Cal State System' },
  // ── Nonprofits / NGOs ─────────────────────────────────────────────────────
  { tenant: 'unitedway', site: 'External', name: 'United Way' },
  { tenant: 'redcross', site: 'External', name: 'American Red Cross' },
  { tenant: 'habitat', site: 'External', name: 'Habitat for Humanity' },
  { tenant: 'goodwill', site: 'External', name: 'Goodwill' },
  { tenant: 'salvation', site: 'External', name: 'Salvation Army' },
  { tenant: 'catholiccharities', site: 'External', name: 'Catholic Charities' },
  { tenant: 'feedingamerica', site: 'External', name: 'Feeding America' },
  { tenant: 'ymca', site: 'External', name: 'YMCA' },
  { tenant: 'boys', site: 'External', name: 'Boys & Girls Clubs' },
  // ── More Tech ─────────────────────────────────────────────────────────────
  { tenant: 'micron', site: 'External', name: 'Micron Technology' },
  { tenant: 'qualcomm', site: 'qualcomm', name: 'Qualcomm' },
  { tenant: 'broadcom', site: 'External', name: 'Broadcom' },
  { tenant: 'marvell', site: 'External', name: 'Marvell' },
  { tenant: 'amd', site: 'External', name: 'AMD' },
  { tenant: 'nvidia', site: 'nvidia', wdN: 'wd1', name: 'NVIDIA' },
  { tenant: 'intel', site: 'External', name: 'Intel' },
  { tenant: 'arm', site: 'External', name: 'Arm Holdings' },
  { tenant: 'analog', site: 'analogdevices', name: 'Analog Devices' },
  { tenant: 'ti', site: 'ti', name: 'Texas Instruments' },
  { tenant: 'xilinx', site: 'External', name: 'Xilinx (AMD)' },
  { tenant: 'nxp', site: 'External', name: 'NXP Semiconductors' },
  { tenant: 'infineon', site: 'External', name: 'Infineon' },
  { tenant: 'stmicroelectronics', site: 'External', name: 'STMicroelectronics' },
  { tenant: 'lattice', site: 'External', name: 'Lattice Semiconductor' },
  { tenant: 'microchip', site: 'External', name: 'Microchip Technology' },
  { tenant: 'renesas', site: 'External', name: 'Renesas Electronics' },
  { tenant: 'maxlinear', site: 'External', name: 'MaxLinear' },
  { tenant: 'monolithicpower', site: 'External', name: 'Monolithic Power Systems' },
  { tenant: 'skyworks', site: 'External', name: 'Skyworks Solutions' },
  { tenant: 'qorvo', site: 'External', name: 'Qorvo' },
  { tenant: 'wolfspeed', site: 'External', name: 'Wolfspeed' },
  { tenant: 'onsemi', site: 'External', name: 'onsemi' },
  { tenant: 'synaptics', site: 'External', name: 'Synaptics' },
  { tenant: 'cirruslogic', site: 'External', name: 'Cirrus Logic' },
  { tenant: 'impinj', site: 'External', name: 'Impinj' },
  { tenant: 'corsair', site: 'External', name: 'Corsair' },
  { tenant: 'logitech', site: 'logitech', name: 'Logitech' },
  { tenant: 'zebra', site: 'External', name: 'Zebra Technologies' },
  { tenant: 'datalogic', site: 'External', name: 'Datalogic' },
  { tenant: 'intermec', site: 'External', name: 'Honeywell Safety' },
  { tenant: 'trimble', site: 'External', name: 'Trimble' },
  { tenant: 'garmin', site: 'garmin', name: 'Garmin' },
  { tenant: 'verizon', site: 'verizon', name: 'Verizon' },
  { tenant: 'att', site: 'att', wdN: 'wd1', name: 'AT&T' },
  { tenant: 'tmobile', site: 'tmobile', name: 'T-Mobile' },
  { tenant: 'comcast', site: 'comcast', name: 'Comcast' },
  { tenant: 'charter', site: 'charter', name: 'Charter Communications' },
  { tenant: 'cox', site: 'cox', name: 'Cox Communications' },
  { tenant: 'dish', site: 'dish', name: 'DISH Network' },
  { tenant: 'lumen', site: 'External', name: 'Lumen Technologies' },
  { tenant: 'centurylink', site: 'External', name: 'CenturyLink' },
  { tenant: 'windstream', site: 'External', name: 'Windstream' },
  // ── More Finance ──────────────────────────────────────────────────────────
  { tenant: 'lazard', site: 'External', name: 'Lazard' },
  { tenant: 'evercore', site: 'External', name: 'Evercore' },
  { tenant: 'pjt', site: 'External', name: 'PJT Partners' },
  { tenant: 'houlihan', site: 'External', name: 'Houlihan Lokey' },
  { tenant: 'jefferies', site: 'External', name: 'Jefferies' },
  { tenant: 'stifel', site: 'External', name: 'Stifel' },
  { tenant: 'raymond', site: 'raymondjames', name: 'Raymond James' },
  { tenant: 'edwardjones', site: 'edwardjones', name: 'Edward Jones' },
  { tenant: 'lpl', site: 'External', name: 'LPL Financial' },
  { tenant: 'tiaa', site: 'tiaa', name: 'TIAA' },
  { tenant: 'invesco', site: 'External', name: 'Invesco' },
  { tenant: 'nuveen', site: 'External', name: 'Nuveen' },
  { tenant: 'pimco', site: 'External', name: 'PIMCO' },
  { tenant: 'ares', site: 'External', name: 'Ares Management' },
  { tenant: 'apollo', site: 'External', name: 'Apollo Global' },
  { tenant: 'carlyle', site: 'External', name: 'Carlyle Group' },
  { tenant: 'kkr', site: 'External', name: 'KKR' },
  { tenant: 'tpg', site: 'External', name: 'TPG' },
  { tenant: 'warburg', site: 'External', name: 'Warburg Pincus' },
  { tenant: 'silverlake', site: 'External', name: 'Silver Lake' },
  { tenant: 'hg', site: 'External', name: 'HgCapital' },
  { tenant: 'nea', site: 'External', name: 'NEA' },
  { tenant: 'greylock', site: 'External', name: 'Greylock' },
  { tenant: 'sequoia', site: 'External', name: 'Sequoia Capital' },
  { tenant: 'a16z', site: 'External', name: 'Andreessen Horowitz' },
  { tenant: 'benchmarkcapital', site: 'External', name: 'Benchmark' },
  { tenant: 'accel', site: 'External', name: 'Accel' },
  { tenant: 'lightspeed', site: 'External', name: 'Lightspeed' },
  { tenant: 'general-catalyst', site: 'External', name: 'General Catalyst' },
  // ── More Healthcare ───────────────────────────────────────────────────────
  { tenant: 'mayo', site: 'mayoclinic', name: 'Mayo Clinic' },
  { tenant: 'clevelandclinic', site: 'clevelandclinic', name: 'Cleveland Clinic' },
  { tenant: 'jhm', site: 'External', name: 'Johns Hopkins Medicine' },
  { tenant: 'ucsf', site: 'ucsf', name: 'UCSF Health' },
  { tenant: 'massgeneral', site: 'External', name: 'Mass General Brigham' },
  { tenant: 'cedars', site: 'External', name: 'Cedars-Sinai' },
  { tenant: 'northwell', site: 'northwell', name: 'Northwell Health' },
  { tenant: 'advocateaurorahealth', site: 'External', name: 'Advocate Aurora' },
  { tenant: 'ascension', site: 'ascension', name: 'Ascension Health' },
  { tenant: 'commonspirit', site: 'External', name: 'CommonSpirit Health' },
  { tenant: 'intermountain', site: 'External', name: 'Intermountain Health' },
  { tenant: 'unitypoint', site: 'External', name: 'UnityPoint Health' },
  { tenant: 'banerhealth', site: 'External', name: 'Banner Health' },
  { tenant: 'providenthealthcare', site: 'External', name: 'Providence Health' },
  { tenant: 'scripps', site: 'External', name: 'Scripps Health' },
  { tenant: 'sharp', site: 'External', name: 'Sharp Healthcare' },
  { tenant: 'sharp', site: 'External', name: 'Sharp Healthcare' },
  { tenant: 'sutter', site: 'External', name: 'Sutter Health' },
  { tenant: 'dignity', site: 'External', name: 'Dignity Health' },
  { tenant: 'healthpartners', site: 'External', name: 'HealthPartners' },
  { tenant: 'fairview', site: 'External', name: 'Fairview Health' },
  { tenant: 'altru', site: 'External', name: 'Altru Health System' },
  { tenant: 'sanfordhealth', site: 'sanfordhealth', name: 'Sanford Health' },
  { tenant: 'avera', site: 'External', name: 'Avera Health' },
  { tenant: 'ssm', site: 'External', name: 'SSM Health' },
  { tenant: 'mercy', site: 'mercy', name: 'Mercy Health' },
  { tenant: 'oschsner', site: 'External', name: 'Ochsner Health' },
  { tenant: 'lcmc', site: 'External', name: 'LCMC Health' },
  { tenant: 'wellstar', site: 'External', name: 'Wellstar Health' },
  { tenant: 'piedmont', site: 'External', name: 'Piedmont Healthcare' },
  { tenant: 'atrium', site: 'External', name: 'Atrium Health' },
  { tenant: 'carilionclinic', site: 'External', name: 'Carilion Clinic' },
  { tenant: 'inova', site: 'External', name: 'Inova Health' },
  { tenant: 'medstar', site: 'External', name: 'MedStar Health' },
  // ── Government / Public Sector ────────────────────────────────────────────
  { tenant: 'cityofchicago', site: 'External', name: 'City of Chicago' },
  { tenant: 'lacity', site: 'External', name: 'City of Los Angeles' },
  { tenant: 'nyc', site: 'External', name: 'NYC Government' },
  { tenant: 'seattle', site: 'External', name: 'City of Seattle' },
  { tenant: 'austin', site: 'External', name: 'City of Austin' },
  { tenant: 'denver', site: 'External', name: 'City of Denver' },
  { tenant: 'phoenix', site: 'External', name: 'City of Phoenix' },
  { tenant: 'metro', site: 'External', name: 'LA Metro' },
  { tenant: 'mta', site: 'External', name: 'MTA New York' },
  { tenant: 'port', site: 'External', name: 'Port Authority NY/NJ' },
  { tenant: 'tva', site: 'External', name: 'Tennessee Valley Authority' },
  { tenant: 'usps', site: 'External', name: 'USPS' },
  { tenant: 'hud', site: 'External', name: 'HUD' },
  { tenant: 'epa', site: 'External', name: 'EPA' },
  { tenant: 'doi', site: 'External', name: 'Dept of Interior' },
  // ── More Education ────────────────────────────────────────────────────────
  { tenant: 'harvard', site: 'harvard', name: 'Harvard University' },
  { tenant: 'upenn', site: 'upenn', name: 'University of Pennsylvania' },
  { tenant: 'dartmouth', site: 'External', name: 'Dartmouth' },
  { tenant: 'brownuniversity', site: 'External', name: 'Brown University' },
  { tenant: 'cornell', site: 'cornell', name: 'Cornell University' },
  { tenant: 'cmu', site: 'External', name: 'Carnegie Mellon University' },
  { tenant: 'rutgers', site: 'External', name: 'Rutgers University' },
  { tenant: 'psu', site: 'psu', name: 'Penn State' },
  { tenant: 'ohio', site: 'External', name: 'Ohio State University' },
  { tenant: 'purdue', site: 'External', name: 'Purdue University' },
  { tenant: 'indiana', site: 'External', name: 'Indiana University' },
  { tenant: 'michigan', site: 'External', name: 'University of Michigan' },
  { tenant: 'minnesota', site: 'External', name: 'University of Minnesota' },
  { tenant: 'wisconsin', site: 'External', name: 'University of Wisconsin' },
  { tenant: 'illinois', site: 'uiuc', name: 'University of Illinois' },
  { tenant: 'texas', site: 'External', name: 'University of Texas' },
  { tenant: 'unc', site: 'External', name: 'UNC Chapel Hill' },
  { tenant: 'virginia', site: 'External', name: 'University of Virginia' },
  { tenant: 'georgia', site: 'External', name: 'University of Georgia' },
  { tenant: 'florida', site: 'External', name: 'University of Florida' },
  { tenant: 'miami', site: 'External', name: 'University of Miami' },
  { tenant: 'tulane', site: 'External', name: 'Tulane University' },
  { tenant: 'tufts', site: 'External', name: 'Tufts University' },
  { tenant: 'bu', site: 'External', name: 'Boston University' },
  { tenant: 'bc', site: 'External', name: 'Boston College' },
  { tenant: 'northeastern', site: 'External', name: 'Northeastern University' },
];

const DEFAULT_WORKDAY_MAX_BOARDS = Number(process.env.WORKDAY_MAX_BOARDS) || 400
const DEFAULT_WORKDAY_LIMIT_PER_PAGE = 20
const DEFAULT_WORKDAY_MAX_PAGES = 10
const WORKDAY_DELAY_MS = 300

interface WorkdayJob {
  title?: string
  locationsText?: string
  timeType?: string
  postedOn?: string
  externalPath?: string
  bulletFields?: string[]
}

interface WorkdayResponse {
  jobPostings?: WorkdayJob[]
  total?: number
}

function buildWorkdayUrl(board: WorkdayBoard, offset: number): { url: string; body: string } {
  const wdN = board.wdN ?? 'wd5'
  const url = `https://${board.tenant}.${wdN}.myworkdayjobs.com/wday/cxs/${board.tenant}/${board.site}/jobs`
  const body = JSON.stringify({
    limit: DEFAULT_WORKDAY_LIMIT_PER_PAGE,
    offset,
    searchText: '',
    appliedFacets: {},
  })
  return { url, body }
}

function mapWorkdayJob(board: WorkdayBoard, job: WorkdayJob): NormalizedPortalJob | null {
  const title = String(job.title ?? '').trim()
  if (!title) return null
  const wdN = board.wdN ?? 'wd5'
  const path = String(job.externalPath ?? '').trim()
  const sourceUrl = path
    ? `https://${board.tenant}.${wdN}.myworkdayjobs.com${path}`
    : `https://${board.tenant}.${wdN}.myworkdayjobs.com/jobs`
  return {
    title,
    company: board.name ?? board.tenant,
    location: String(job.locationsText ?? 'Unknown').trim() || 'Unknown',
    remote: /remote|hybrid/i.test(job.locationsText ?? '') ? 'Remote' : 'Unknown',
    type: String(job.timeType ?? 'Full-time').trim() || 'Full-time',
    sourceUrl,
    posted: job.postedOn,
    description: Array.isArray(job.bulletFields) ? job.bulletFields.join(' ') : '',
    tags: ['Workday'],
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchAllWorkdayJobs(): Promise<ScrapedJob[]> {
  const envBoards = parseCsvEnv(process.env.WORKDAY_BOARDS)
  const boards = envBoards.length > 0
    ? envBoards.map((s) => {
        const [tenant, site] = s.split(':')
        return { tenant: tenant?.trim() ?? '', site: site?.trim() ?? tenant?.trim() ?? '' }
      }).filter((b) => b.tenant && b.site)
    : DEFAULT_WORKDAY_BOARDS.slice(0, DEFAULT_WORKDAY_MAX_BOARDS)

  const normalized: NormalizedPortalJob[] = []

  for (const board of boards) {
    try {
      for (let page = 0; page < DEFAULT_WORKDAY_MAX_PAGES; page++) {
        const offset = page * DEFAULT_WORKDAY_LIMIT_PER_PAGE
        const { url, body } = buildWorkdayUrl(board, offset)
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body,
        })
        if (!response.ok) break
        const data = await response.json() as WorkdayResponse
        const postings = Array.isArray(data?.jobPostings) ? data.jobPostings : []
        if (postings.length === 0) break
        for (const job of postings) {
          const mapped = mapWorkdayJob(board, job)
          if (mapped) normalized.push(mapped)
        }
        if (postings.length < DEFAULT_WORKDAY_LIMIT_PER_PAGE) break
        await delay(WORKDAY_DELAY_MS)
      }
    } catch (error) {
      console.warn(`[WorkdayAPI] Failed ${(board as WorkdayBoard).name ?? board.tenant}:`, String(error))
    }
  }

  console.log(`[WorkdayAPI] Fetched ${normalized.length} jobs from ${boards.length} boards.`)
  const direct = await normalizeJobsWithCoordinates('Workday', normalized)
  if (direct.length > 0) return direct
  return fetchPortalFallbackJobs('Workday', (url) => /myworkdayjobs\.com/i.test(url))
}
