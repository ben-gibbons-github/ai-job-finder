import type { ScrapedJob } from './ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';

// iCIMS is one of the largest ATS platforms, used by thousands of enterprise companies.
// Public job feed URL: https://careers-{tenant}.icims.com/jobs/search?pr=1&ip=1&metaKeywords=&hashed=-625949866&mobile=false&width=990&height=500&bga=true&needsRedirect=false&jan1offset=-300&jun1offset=-240&in_iframe=1&format=json
// Simpler search endpoint: https://{tenant}.jobs.icims.com/jobs/search
// We use the API endpoint for each company.

const DEFAULT_ICIMS_TENANTS = [
  // ── Healthcare Systems ────────────────────────────────────────────────────
  'careers.adventhealth', 'careers.osumc', 'careers.uhhospitals',
  'careers.lifepoint', 'careers.kindredhealthcare', 'careers.selectmedical',
  'careers.encompasshealth', 'careers.acuitycare', 'careers.amsurg',
  'careers.davita', 'careers.dialysisclinic', 'careers.usrenalcare',
  'careers.vitas', 'careers.amedisys', 'careers.lhc-group',
  'careers.alliancehealthcare', 'careers.kindred-athome', 'careers.gentiva',
  'careers.csl', 'careers.biolife', 'careers.octapharma',
  'careers.grifols', 'careers.kedrion', 'careers.biotest',
  // ── Technology ────────────────────────────────────────────────────────────
  'careers.dell', 'careers.hp', 'careers.lenovo', 'careers.asus',
  'careers.acer', 'careers.msi', 'careers.gigabyte',
  'careers.seagate', 'careers.westerndigital', 'careers.sandisk',
  'careers.kingston', 'careers.crucial', 'careers.corsair',
  'careers.supermicro', 'careers.arista', 'careers.juniper',
  'careers.ciena', 'careers.calix', 'careers.adtran',
  'careers.viavi', 'careers.spirent', 'careers.ixia',
  'careers.eline', 'careers.brocade', 'careers.qlogic',
  // ── Retail / Consumer ────────────────────────────────────────────────────
  'careers.starbucks', 'careers.mcdonalds', 'careers.yum',
  'careers.subway', 'careers.dominos', 'careers.papa-johns',
  'careers.chipotle', 'careers.panera', 'careers.shake-shack',
  'careers.darden', 'careers.texas-roadhouse', 'careers.cracker-barrel',
  'careers.dennys', 'careers.ihop', 'careers.waffle-house',
  'careers.dunkin', 'careers.tim-hortons', 'careers.popeyes',
  'careers.whataburger', 'careers.sonic-drive-in', 'careers.culvers',
  'careers.jack-in-the-box', 'careers.del-taco', 'careers.taco-bell',
  'careers.rallys', 'careers.hardees', 'careers.carls-jr',
  'careers.arby', 'careers.buffalo-wild-wings', 'careers.applebees',
  'careers.chilis', 'careers.olive-garden', 'careers.red-lobster',
  'careers.red-robin', 'careers.perkins', 'careers.golden-corral',
  // ── Manufacturing ────────────────────────────────────────────────────────
  'careers.ford', 'careers.gm', 'careers.stellantis', 'careers.toyota',
  'careers.honda', 'careers.nissan', 'careers.mazda', 'careers.subaru',
  'careers.kia', 'careers.hyundai', 'careers.mercedes', 'careers.bmw',
  'careers.volkswagen', 'careers.audi', 'careers.volvo', 'careers.saab',
  'careers.fiat', 'careers.jeep', 'careers.dodge', 'careers.chrysler',
  'careers.tesla', 'careers.rivian', 'careers.lucid',
  'careers.dana', 'careers.lear', 'careers.aptiv', 'careers.borgwarner',
  'careers.tenneco', 'careers.delphi', 'careers.visteon',
  'careers.autoliv', 'careers.gentex', 'careers.modine',
  'careers.wabash', 'careers.oshkosh', 'careers.paccar',
  'careers.navistar', 'careers.cummins', 'careers.allison',
  // ── Finance & Insurance ───────────────────────────────────────────────────
  'careers.nationswide', 'careers.liberty-mutual', 'careers.statefarm',
  'careers.aaa', 'careers.geico', 'careers.usaa', 'careers.aig',
  'careers.chubb', 'careers.hartford', 'careers.unum',
  'careers.guardian', 'careers.massmutual', 'careers.newyorklife',
  'careers.pacificlife', 'careers.securian', 'careers.mutual-of-omaha',
  'careers.tokiomarinerisk', 'careers.zurich', 'careers.generali',
  'careers.allianz', 'careers.axa', 'careers.aviva', 'careers.lloyds',
  // ── Staffing / Recruiting ─────────────────────────────────────────────────
  'careers.adecco', 'careers.manpower', 'careers.randstad',
  'careers.staffmark', 'careers.kellyservices', 'careers.spherion',
  'careers.robert-half', 'careers.kforce', 'careers.insight-global',
  'careers.apex-group', 'careers.teksystems', 'careers.modis',
  'careers.aerotek', 'careers.volt', 'careers.ctech',
  'careers.pomeroy', 'careers.unison', 'careers.solvere-one',
  // ── Education ────────────────────────────────────────────────────────────
  'careers.lausd', 'careers.nycdoe', 'careers.dcps',
  'careers.cps', 'careers.dps', 'careers.hisd',
  'careers.browardschools', 'careers.palmbeach-schools',
  'careers.duvalschools', 'careers.orange-county-schools',
  'careers.wake-county', 'careers.cmsschools',
  'careers.gcps', 'careers.gusd', 'careers.saisd',
];

const DEFAULT_ICIMS_MAX_TENANTS = Number(process.env.ICIMS_MAX_TENANTS) || 100
const DEFAULT_ICIMS_RESULTS = 100
const ICIMS_DELAY_MS = 400

interface IcimsJob {
  id?: number
  jobtitle?: { formatted?: string }
  joblocation?: { formatted?: string }
  jobtype?: { formatted?: string }
  customfield1?: string // description sometimes
  dateposted?: string
  folder?: { formatted?: string }
}

interface IcimsResponse {
  searchResults?: IcimsJob[]
  totalCount?: number
}

function buildIcimsUrl(tenant: string, offset: number): string {
  return `https://${tenant}.icims.com/jobs/search?ss=1&searchKeyword=&searchCategory=&searchLocation=&searchZip=&searchRadius=30&searchPositionType=&iis=Job+Board&iisn=All+Jobs&mobile=false&width=1000&height=500&bga=true&needsRedirect=false&json=1&pr=${offset + 1}&numresults=${DEFAULT_ICIMS_RESULTS}`
}

function mapIcimsJob(tenant: string, job: IcimsJob): NormalizedPortalJob | null {
  const title = String(job.jobtitle?.formatted ?? '').trim()
  if (!title) return null
  const jobId = job.id
  const sourceUrl = jobId
    ? `https://${tenant}.icims.com/jobs/${jobId}/job`
    : `https://${tenant}.icims.com/jobs`
  return {
    title,
    company: tenant.replace(/^careers\./, '').replace(/-/g, ' '),
    location: String(job.joblocation?.formatted ?? 'Unknown').trim() || 'Unknown',
    remote: /remote|hybrid/i.test(job.joblocation?.formatted ?? '') ? 'Remote' : 'Unknown',
    type: String(job.jobtype?.formatted ?? 'Full-time').trim() || 'Full-time',
    sourceUrl,
    posted: job.dateposted,
    description: String(job.customfield1 ?? '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
    tags: ['iCIMS'],
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchAllIcimsJobs(): Promise<ScrapedJob[]> {
  const envTenants = parseCsvEnv(process.env.ICIMS_TENANTS)
  const tenants = (envTenants.length > 0 ? envTenants : DEFAULT_ICIMS_TENANTS)
    .slice(0, DEFAULT_ICIMS_MAX_TENANTS)

  const normalized: NormalizedPortalJob[] = []

  for (const tenant of tenants) {
    try {
      const url = buildIcimsUrl(tenant, 0)
      const response = await fetchJson(url) as IcimsResponse
      const jobs = Array.isArray(response?.searchResults) ? response.searchResults : []
      for (const job of jobs) {
        const mapped = mapIcimsJob(tenant, job)
        if (mapped) normalized.push(mapped)
      }
      await delay(ICIMS_DELAY_MS)
    } catch (error) {
      console.warn(`[iCIMS] Failed tenant ${tenant}:`, String(error))
    }
  }

  console.log(`[iCIMS] Fetched ${normalized.length} jobs from ${tenants.length} tenants.`)
  return normalizeJobsWithCoordinates('iCIMS', normalized)
}
