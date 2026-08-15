import type { ScrapedJob } from './ScrapedJob.js';
import { fetchJson, normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { fetchPortalJobsFromEndpointList } from './GenericEndpointPortalAPI.js';
import { fetchPortalFallbackJobs } from './TerraBoardFallback.js';

// SmartRecruiters public jobs API
// GET https://api.smartrecruiters.com/v1/companies/{slug}/postings
// Returns paginated job postings.

const DEFAULT_SR_COMPANIES = [
  // ── Tech ──────────────────────────────────────────────────────────────────
  'bosch', 'siemens', 'continental', 'zeiss', 'bayer', 'basf',
  'henkel', 'covestro', 'lanxess', 'evonik', 'merck-kgaa', 'degussa',
  'sap', 'software-ag', 'gk-software', 'nttdata', 'tata-consulting',
  'infosys-bpm', 'wipro-limited', 'hcl-technologies', 'tech-mahindra',
  'mphasis-ltd', 'hexaware-tech', 'mindtree-ltd', 'cyient', 'zensar',
  'persistent-systems', 'mastech', 'geometric', 'infosonics', 'mascon',
  // ── Retail / Consumer ─────────────────────────────────────────────────────
  'ikea', 'h-and-m', 'zara-inditex', 'mango-fashion', 'uniqlo',
  'topshop', 'primark', 'next-plc', 'marks-spencer', 'john-lewis',
  'debenhams', 'selfridges', 'harrods', 'fortnum-mason', 'harvey-nichols',
  'aldi', 'lidl', 'rewe', 'edeka', 'netto', 'penny-market',
  'carrefour', 'leclerc', 'intermarche', 'auchan', 'casino-group',
  'metro-group', 'real-hypermarkt', 'kaufland', 'globus',
  // ── Finance ───────────────────────────────────────────────────────────────
  'ing-group', 'ing-bank', 'abn-amro', 'rabobank', 'fortis',
  'bnp-paribas', 'credit-agricole', 'societe-generale', 'natixis',
  'credit-mutuel', 'bpce', 'la-banque-postale', 'cic', 'bred',
  'deutsche-bank', 'commerzbank', 'dz-bank', 'hvb-unicredit',
  'helaba', 'lbbw', 'bayernlb', 'norddeutsche', 'hamburger',
  'sparkasse', 'volksbank', 'postbank', 'comdirect',
  'unicredit', 'intesa-sanpaolo', 'mediobanca', 'banca-sella',
  'ubi-banca', 'bper-banca', 'credem', 'cariparma',
  'bbva', 'banco-sabadell', 'caixabank', 'bankinter', 'unicaja',
  'santander-spain', 'ibercaja', 'abanca', 'cajamar',
  'lloyds', 'barclays', 'hsbc', 'natwest', 'standard-chartered',
  'rbs', 'tesco-bank', 'virgin-money', 'metro-bank', 'monzo-bank',
  // ── Healthcare ────────────────────────────────────────────────────────────
  'fresenius', 'fresenius-medical', 'dialysis-fresenius',
  'rhoen-klinikum', 'helios-hospitals', 'asklepios', 'sana-kliniken',
  'ameos', 'damp-gruppe', 'mediclin', 'paracelsus', 'schoen-klinik',
  'spital-group', 'hirslanden', 'luzerner', 'kantonsspital',
  'nhs-england', 'nhs-scotland', 'nhs-wales', 'bupa', 'spire',
  'nuffield-health', 'ramsay-health', 'hca-uk', 'cleveland-clinic-uk',
  // ── Energy ────────────────────────────────────────────────────────────────
  'eon-energy', 'rwe', 'vattenfall', 'uniper', 'innogy',
  'enbw', 'bayernwerk', 'stadtwerke', 'thega', 'enercity',
  'swe', 'mvv-energie', 'ewe', 'sw-kiel', 'hew',
  'total-energies', 'suez-energie', 'engie-france', 'direct-energie',
  'areva', 'edf-france', 'gdf-suez', 'compagnie-nationale',
  'red-electrica', 'iberdrola', 'endesa', 'gas-natural', 'naturgy',
  'enagas', 'repsol', 'cepsa', 'galp',
  // ── Manufacturing ────────────────────────────────────────────────────────
  'volkswagen', 'bmw-group', 'mercedes-benz', 'daimler',
  'porsche', 'audi-ag', 'seat', 'skoda', 'bentley', 'lamborghini',
  'man-truck', 'daf', 'scania', 'volvo-trucks', 'renault-trucks',
  'iveco', 'neoplan', 'evobus', 'solaris',
  'airbus', 'safran', 'thales', 'mbda', 'dassault-aviation',
  'leonardo', 'finmeccanica', 'alenia', 'agustawestland',
  'rheinmetall', 'hensoldt', 'diehl', 'krauss-maffei',
];

const DEFAULT_SR_MAX_COMPANIES = Number(process.env.SR_MAX_COMPANIES) || 80
const SR_DELAY_MS = 400

interface SrJob {
  id?: string
  name?: string
  location?: { country?: string; city?: string; remote?: boolean }
  typeOfEmployment?: string
  releasedDate?: string
  ref?: string
}

interface SrResponse {
  content?: SrJob[]
  totalElements?: number
  totalPages?: number
  number?: number
}

function mapSrJob(company: string, job: SrJob): NormalizedPortalJob | null {
  const title = String(job.name ?? '').trim()
  if (!title) return null
  const city = job.location?.city ?? ''
  const country = job.location?.country ?? ''
  const location = job.location?.remote ? 'Remote' : [city, country].filter(Boolean).join(', ') || 'Unknown'
  const sourceUrl = String(job.ref ?? `https://careers.smartrecruiters.com/${company}`).trim()
  return {
    title,
    company,
    location,
    remote: job.location?.remote ? 'Remote' : 'Unknown',
    type: String(job.typeOfEmployment ?? 'Full-time').replace(/_/g, ' '),
    sourceUrl,
    posted: job.releasedDate,
    description: '',
    tags: ['SmartRecruiters'],
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchAllSmartRecruitersJobs(): Promise<ScrapedJob[]> {
  const envCompanies = parseCsvEnv(process.env.SR_COMPANIES)
  const companies = (envCompanies.length > 0 ? envCompanies : DEFAULT_SR_COMPANIES)
    .slice(0, DEFAULT_SR_MAX_COMPANIES)

  const normalized: NormalizedPortalJob[] = []

  for (const company of companies) {
    try {
      const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=100&offset=0`
      const response = await fetchJson(url) as SrResponse
      const jobs = Array.isArray(response?.content) ? response.content : []
      for (const job of jobs) {
        const mapped = mapSrJob(company, job)
        if (mapped) normalized.push(mapped)
      }
      await delay(SR_DELAY_MS)
    } catch (error) {
      console.warn(`[SmartRecruiters] Failed ${company}:`, String(error))
    }
  }

  if (normalized.length > 0) {
    console.log(`[SmartRecruiters] Fetched ${normalized.length} jobs from ${companies.length} companies.`)
    return normalizeJobsWithCoordinates('SmartRecruiters', normalized)
  }

  // Fall back to endpoint list or Terra
  const direct = await fetchPortalJobsFromEndpointList({
    source: 'SmartRecruiters',
    envVar: 'SMARTRECRUITERS_FEED_ENDPOINTS',
  })
  if (direct.length > 0) return direct
  return fetchPortalFallbackJobs('SmartRecruiters', (url) => /smartrecruiters\.com/i.test(url))
}

