import type { ScrapedJob } from '../core/ScrapedJob.js';
import {
  fetchJson,
  normalizeJobsWithCoordinates,
  parseCsvEnv,
  type NormalizedPortalJob,
} from '../core/PortalIngestionUtils.js';

const DEFAULT_RECRUITEE_BOARDS = ['bunq'];

interface RecruiteeLocation {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface RecruiteeOffer {
  title?: string;
  company_name?: string;
  careers_url?: string;
  published_at?: string;
  description?: string;
  requirements?: string;
  employment_type_code?: string;
  department?: string;
  category_code?: string;
  location?: string;
  locations?: RecruiteeLocation[];
  remote?: boolean;
  tags?: string[];
  status?: string;
}

interface RecruiteeResponse {
  offers?: RecruiteeOffer[];
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatEmploymentType(value: string | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return 'Unknown';
  }
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getLocation(offer: RecruiteeOffer): string {
  const directLocation = String(offer.location ?? '').trim();
  if (directLocation) {
    return directLocation;
  }

  const locations = Array.isArray(offer.locations) ? offer.locations : [];
  return locations
    .map((location) =>
      [location.name || location.city, location.state, location.country]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(', '),
    )
    .filter(Boolean)
    .join(' / ') || 'Unknown';
}

function mapRecruiteeOffer(offer: RecruiteeOffer, board: string): NormalizedPortalJob | null {
  const title = String(offer.title ?? '').trim();
  const sourceUrl = String(offer.careers_url ?? '').trim();
  if (!title || !sourceUrl || (offer.status && offer.status !== 'published')) {
    return null;
  }

  const location = getLocation(offer);
  const tags = [
    offer.department,
    offer.category_code,
    ...(Array.isArray(offer.tags) ? offer.tags : []),
    'Recruitee',
  ]
    .map((tag) => String(tag ?? '').trim())
    .filter(Boolean);

  return {
    title,
    company: String(offer.company_name ?? board).trim() || board,
    location,
    remote: offer.remote || /remote/i.test(location) ? 'Remote' : 'On-site',
    type: formatEmploymentType(offer.employment_type_code),
    sourceUrl,
    posted: String(offer.published_at ?? '').trim() || undefined,
    description: stripHtml(`${offer.description ?? ''} ${offer.requirements ?? ''}`),
    tags,
  };
}

export async function fetchAllRecruiteeJobs(): Promise<ScrapedJob[]> {
  const boards = parseCsvEnv(process.env.RECRUITEE_BOARDS);
  const configuredBoards = boards.length > 0 ? boards : DEFAULT_RECRUITEE_BOARDS;
  const dedup = new Map<string, NormalizedPortalJob>();

  for (const board of configuredBoards) {
    try {
      const payload = (await fetchJson(
        `https://${encodeURIComponent(board)}.recruitee.com/api/offers/`,
      )) as RecruiteeResponse;

      for (const offer of Array.isArray(payload.offers) ? payload.offers : []) {
        const mapped = mapRecruiteeOffer(offer, board);
        if (mapped) {
          dedup.set(mapped.sourceUrl, mapped);
        }
      }
    } catch (error) {
      console.warn(`[RecruiteeAPI] Failed to fetch ${board}:`, String(error));
    }
  }

  return normalizeJobsWithCoordinates('Recruitee', Array.from(dedup.values()));
}