import type { ScrapedJob } from './ScrapedJob.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from './PortalIngestionUtils.js';
import { capKeywords, getSharedJobTitleKeywords } from './SharedJobTitleKeywords.js';

// LinkedIn exposes public RSS feeds for job searches.
// URL format: https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={kw}&location={loc}&start={offset}
// The guest API returns JSON with job cards without requiring authentication.

const LINKEDIN_JOBS_GUEST_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

const DEFAULT_LINKEDIN_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data scientist',
  'product manager',
]);
const DEFAULT_LINKEDIN_MAX_KEYWORDS = 60;
const DEFAULT_LINKEDIN_LOCATIONS = [
  'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'Netherlands', 'Remote',
];
const DEFAULT_LINKEDIN_MAX_LOCATIONS = 5;
const DEFAULT_LINKEDIN_PAGES_PER_COMBO = 3; // 25 results per page
const DEFAULT_LINKEDIN_DELAY_MS = 600;

interface LinkedInJobCard {
  entityUrn?: string;
  title?: string;
  companyName?: string;
  formattedLocation?: string;
  listedAt?: number;
  jobUrl?: string;
  workplaceTypes?: string[];
}

interface LinkedInJobsResponse {
  elements?: LinkedInJobCard[];
}

function parseLinkedInJobCard(card: LinkedInJobCard): NormalizedPortalJob | null {
  const title = String(card.title ?? '').trim();
  const sourceUrl = String(card.jobUrl ?? '').trim();
  if (!title || !sourceUrl) return null;

  const isRemote = (card.workplaceTypes ?? []).some(
    (t) => String(t).toLowerCase().includes('remote'),
  );

  return {
    title,
    company: String(card.companyName ?? '').trim() || 'Unknown',
    location: String(card.formattedLocation ?? (isRemote ? 'Remote' : 'Unknown')).trim(),
    remote: isRemote ? 'Remote' : 'Unknown',
    type: 'Full-time',
    sourceUrl,
    posted: card.listedAt ? new Date(card.listedAt).toISOString() : undefined,
    description: '',
    tags: ['LinkedIn'],
  };
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAllLinkedInJobs(): Promise<ScrapedJob[]> {
  const envKeywords = parseCsvEnv(process.env.LINKEDIN_KEYWORDS);
  const keywords = capKeywords(
    envKeywords.length > 0 ? envKeywords : DEFAULT_LINKEDIN_KEYWORDS,
    Math.max(1, Number(process.env.LINKEDIN_MAX_KEYWORDS || DEFAULT_LINKEDIN_MAX_KEYWORDS)),
  );

  const envLocations = parseCsvEnv(process.env.LINKEDIN_LOCATIONS);
  const locations = (envLocations.length > 0 ? envLocations : DEFAULT_LINKEDIN_LOCATIONS)
    .slice(0, Math.max(1, Number(process.env.LINKEDIN_MAX_LOCATIONS || DEFAULT_LINKEDIN_MAX_LOCATIONS)));

  const pagesPerCombo = Math.max(1, Number(process.env.LINKEDIN_PAGES_PER_COMBO || DEFAULT_LINKEDIN_PAGES_PER_COMBO));
  const delayMs = Math.max(100, Number(process.env.LINKEDIN_DELAY_MS || DEFAULT_LINKEDIN_DELAY_MS));

  const normalized: NormalizedPortalJob[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    for (const location of locations) {
      for (let page = 0; page < pagesPerCombo; page++) {
        const start = page * 25;
        try {
          const url = new URL(LINKEDIN_JOBS_GUEST_API);
          url.searchParams.set('keywords', keyword);
          url.searchParams.set('location', location);
          url.searchParams.set('start', String(start));
          url.searchParams.set('f_TPR', 'r2592000'); // last 30 days

          const response = await fetch(url.toString(), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)',
              'Accept': 'application/json',
            },
          });

          if (!response.ok) {
            if (response.status === 429 || response.status === 403) {
              console.warn(`[LinkedInJobsAPI] Rate limited (${response.status}) — stopping combo "${keyword}"/"${location}".`);
              break;
            }
            break;
          }

          const data = await response.json() as LinkedInJobsResponse;
          const elements = Array.isArray(data?.elements) ? data.elements : [];
          if (elements.length === 0) break;

          for (const card of elements) {
            const mapped = parseLinkedInJobCard(card);
            if (!mapped) continue;
            if (seen.has(mapped.sourceUrl)) continue;
            seen.add(mapped.sourceUrl);
            normalized.push(mapped);
          }

          if (elements.length < 25) break;
          await delay(delayMs);
        } catch (error) {
          console.warn(`[LinkedInJobsAPI] Error for "${keyword}"/"${location}" page ${page}:`, String(error));
          break;
        }
      }
    }
  }

  console.log(`[LinkedInJobsAPI] Fetched ${normalized.length} jobs.`);
  return normalizeJobsWithCoordinates('LinkedIn', normalized);
}
