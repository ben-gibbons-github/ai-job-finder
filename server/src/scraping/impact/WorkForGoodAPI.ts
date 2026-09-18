import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';

const WORKFORGOOD_SEARCH_URL = 'https://app.workforgood.org/api/candidate/listings/search';
const WORKFORGOOD_LISTING_URL = 'https://app.workforgood.org/candidate?listing=';
const PAGE_LIMIT = 100;
const MAX_WORKFORGOOD_PAGES = 100;
const FETCH_TIMEOUT_MS = 30_000;

interface WorkForGoodLocation {
  formatted?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface WorkForGoodOrganization {
  name?: string;
  website_home_url?: string;
}

interface WorkForGoodRoleOpening {
  role_type?: string;
  time_commitment?: string[];
  workplace_option?: string;
  application_type?: string;
  external_application_url?: string;
  short_description?: string;
  location_description?: string;
  role_categories?: string[];
  impact_areas?: string[];
  benefits?: string[];
  salary_min?: number;
  salary_max?: number;
  hourly_rate_min?: number;
  hourly_rate_max?: number;
}

interface WorkForGoodListing {
  id?: string;
  name?: string;
  published_at?: string;
  listed_by_name?: string;
  location?: WorkForGoodLocation;
  organization?: WorkForGoodOrganization;
  role_opening?: WorkForGoodRoleOpening;
}

interface WorkForGoodSearchResponse {
  listings?: WorkForGoodListing[];
  total?: number;
}

function formatEnumLabel(value: string | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getRemote(workplaceOption: string | undefined): string {
  const normalized = String(workplaceOption ?? '').toLowerCase();
  if (normalized === 'remote') {
    return 'Remote';
  }
  if (normalized === 'hybrid') {
    return 'Hybrid';
  }
  if (normalized === 'in_person') {
    return 'On-site';
  }
  return 'Unknown';
}

function getLocation(listing: WorkForGoodListing): string {
  const formatted = String(listing.location?.formatted ?? '').trim();
  if (formatted) {
    return formatted;
  }
  const description = String(listing.role_opening?.location_description ?? '').trim();
  if (description) {
    return description;
  }
  return getRemote(listing.role_opening?.workplace_option) === 'Remote' ? 'Remote' : 'Unknown';
}

function mapWorkForGoodListing(listing: WorkForGoodListing): NormalizedPortalJob | null {
  const id = String(listing.id ?? '').trim();
  const title = String(listing.name ?? '').trim();
  if (!id || !title) {
    return null;
  }

  const roleOpening = listing.role_opening ?? {};
  const externalUrl = String(roleOpening.external_application_url ?? '').trim();
  const sourceUrl =
    roleOpening.application_type === 'external' && externalUrl
      ? externalUrl
      : `${WORKFORGOOD_LISTING_URL}${id}`;

  const tags = [
    ...(Array.isArray(roleOpening.role_categories) ? roleOpening.role_categories : []),
    ...(Array.isArray(roleOpening.impact_areas) ? roleOpening.impact_areas : []),
    'WorkForGood',
  ].map((tag) => formatEnumLabel(tag)).filter(Boolean);

  const type = Array.isArray(roleOpening.time_commitment) && roleOpening.time_commitment.length > 0
    ? roleOpening.time_commitment.map((value) => formatEnumLabel(value)).join(', ')
    : formatEnumLabel(roleOpening.role_type) || 'Unknown';

  return {
    title,
    company: String(listing.organization?.name ?? listing.listed_by_name ?? 'Unknown Company').trim() || 'Unknown Company',
    location: getLocation(listing),
    remote: getRemote(roleOpening.workplace_option),
    type,
    sourceUrl,
    posted: String(listing.published_at ?? '').trim() || undefined,
    description: String(roleOpening.short_description ?? '').trim(),
    tags,
  };
}

async function fetchWorkForGoodPage(offset: number): Promise<WorkForGoodSearchResponse> {
  const res = await fetch(WORKFORGOOD_SEARCH_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'job-finder-super-scraper/1.0',
    },
    body: JSON.stringify({
      keywords: '',
      locationMode: 'city',
      location: '',
      address: '',
      distance: '100',
      roleType: [],
      roleCategories: [],
      timeCommitment: [],
      workplace: [],
      experience: [],
      education: [],
      mission: [],
      benefits: [],
      organizations: [],
      salaryMin: '',
      salaryMax: '',
      hourlyMin: '',
      hourlyMax: '',
      offset,
      limit: PAGE_LIMIT,
    }),
  });

  if (!res.ok) {
    throw new Error(`Fetch failed for WorkForGood offset=${offset}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as WorkForGoodSearchResponse;
}

export async function fetchAllWorkForGoodJobs(): Promise<ScrapedJob[]> {
  const dedup = new Map<string, NormalizedPortalJob>();

  try {
    let offset = 0;
    let total = Infinity;

    for (let page = 0; page < MAX_WORKFORGOOD_PAGES && offset < total; page += 1) {
      const response = await fetchWorkForGoodPage(offset);
      const listings = Array.isArray(response.listings) ? response.listings : [];
      total = typeof response.total === 'number' ? response.total : listings.length;

      if (listings.length === 0) {
        break;
      }

      for (const listing of listings) {
        const mapped = mapWorkForGoodListing(listing);
        if (mapped) {
          dedup.set(mapped.sourceUrl, mapped);
        }
      }

      offset += listings.length;
    }
  } catch (error) {
    console.warn('[WorkForGoodAPI] Failed to fetch jobs:', String(error));
  }

  return normalizeJobsWithCoordinates('WorkForGood', Array.from(dedup.values()));
}
