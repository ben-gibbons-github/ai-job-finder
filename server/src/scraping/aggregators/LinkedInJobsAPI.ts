import type { ScrapedJob } from '../core/ScrapedJob.js';
import { normalizeJobsWithCoordinates, parseCsvEnv, type NormalizedPortalJob } from '../core/PortalIngestionUtils.js';
import {
  isCachedHttpResponse,
  isRateLimitedScrapeError,
  shouldSkipParsingCachedHttpPages,
} from '../core/httpCache/ScraperHttpCache.js';
import { scraperFetch } from '../core/httpCache/ScraperHttpCache.js';
import { capKeywords, getSharedJobTitleKeywords } from '../core/SharedJobTitleKeywords.js';
import { capLocations, getGlobalLocationCatalog } from '../core/SharedJobLocations.js';
import { sanitizeJobDescription } from '../core/ScrapeDescriptionUtils.js';

// LinkedIn exposes public RSS feeds for job searches.
// URL format: https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={kw}&location={loc}&start={offset}
// The guest API returns JSON with job cards without requiring authentication.

const LINKEDIN_JOBS_GUEST_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

const DEFAULT_LINKEDIN_KEYWORDS = getSharedJobTitleKeywords([
  'software engineer',
  'data scientist',
  'product manager',
]);
const DEFAULT_LINKEDIN_MAX_KEYWORDS = 100;
const DEFAULT_LINKEDIN_LOCATIONS = getGlobalLocationCatalog();
const DEFAULT_LINKEDIN_MAX_LOCATIONS = 80;
const DEFAULT_LINKEDIN_PAGES_PER_COMBO = 6; // 25 results per page
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

function firstMatch(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1]?.trim() ?? '';
}

function parseLinkedInHtml(html: string): NormalizedPortalJob[] {
  const jobs: NormalizedPortalJob[] = [];
  const cards = html.split(/<div[^>]+class=["'][^"']*base-card[^"']*["'][^>]*>/i).slice(1);

  for (const card of cards) {
    const sourceUrl = firstMatch(card, /<a[^>]+class=["'][^"']*base-card__full-link[^"']*["'][^>]+href=["']([^"']+)/i);
    const title = sanitizeJobDescription(firstMatch(card, /<h3[^>]*>([\s\S]*?)<\/h3>/i));
    const company = sanitizeJobDescription(firstMatch(card, /<h4[^>]*>([\s\S]*?)<\/h4>/i));
    const location = sanitizeJobDescription(firstMatch(card, /<span[^>]+class=["'][^"']*job-search-card__location[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const posted = firstMatch(card, /<time[^>]+datetime=["']([^"']+)/i);

    if (!sourceUrl || !title) continue;
    jobs.push({
      title,
      company: company || 'Unknown',
      location: location || 'Unknown',
      remote: /remote/i.test(`${title} ${location}`) ? 'Remote' : 'Unknown',
      type: 'Full-time',
      sourceUrl,
      posted: posted || undefined,
      description: '',
      tags: ['LinkedIn'],
    });
  }

  return jobs;
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
  const locations = capLocations(
    envLocations.length > 0 ? envLocations : DEFAULT_LINKEDIN_LOCATIONS,
    Math.max(1, Number(process.env.LINKEDIN_MAX_LOCATIONS || DEFAULT_LINKEDIN_MAX_LOCATIONS)),
  );

  const pagesPerCombo = Math.max(1, Number(process.env.LINKEDIN_PAGES_PER_COMBO || DEFAULT_LINKEDIN_PAGES_PER_COMBO));
  const delayMs = Math.max(100, Number(process.env.LINKEDIN_DELAY_MS || DEFAULT_LINKEDIN_DELAY_MS));

  const normalized: NormalizedPortalJob[] = [];
  const seen = new Set<string>();
  let shouldStopScraping = false;

  for (const keyword of keywords) {
    if (shouldStopScraping) {
      break;
    }

    for (const location of locations) {
      if (shouldStopScraping) {
        break;
      }

      for (let page = 0; page < pagesPerCombo; page++) {
        const start = page * 25;
        try {
          const url = new URL(LINKEDIN_JOBS_GUEST_API);
          url.searchParams.set('keywords', keyword);
          url.searchParams.set('location', location);
          url.searchParams.set('start', String(start));
          url.searchParams.set('f_TPR', 'r2592000'); // last 30 days

          const response = await scraperFetch(url.toString(), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)',
              'Accept': 'application/json',
            },
          });

          if (!response.ok) {
            if (response.status === 429 || response.status === 403) {
              console.warn(`[LinkedInJobsAPI] Rate limited (${response.status}) — stopping the entire LinkedIn scrape.`);
              shouldStopScraping = true;
              break;
            }
            break;
          }

          if (shouldSkipParsingCachedHttpPages() && response.fromCache) {
            continue;
          }

          const responseText = await response.text();
          let elements: NormalizedPortalJob[];
          if (/^\s*</.test(responseText)) {
            elements = parseLinkedInHtml(responseText);
          } else {
            const data = JSON.parse(responseText) as LinkedInJobsResponse;
            elements = (Array.isArray(data?.elements) ? data.elements : [])
              .map(parseLinkedInJobCard)
              .filter((job): job is NormalizedPortalJob => Boolean(job));
          }
          if (elements.length === 0) break;

          for (const mapped of elements) {
            if (seen.has(mapped.sourceUrl)) continue;
            seen.add(mapped.sourceUrl);
            normalized.push(mapped);
          }

          if (elements.length < 25) break;
          await delay(delayMs);
        } catch (error) {
          if (isRateLimitedScrapeError(error)) {
            console.warn('[LinkedInJobsAPI] Rate limited (429) — stopping the entire LinkedIn scrape.');
            shouldStopScraping = true;
            break;
          }

          console.warn(`[LinkedInJobsAPI] Error for "${keyword}"/"${location}" page ${page}:`, String(error));
          break;
        }

        if (shouldStopScraping) {
          break;
        }
      }
    }
  }

  console.log(`[LinkedInJobsAPI] Fetched ${normalized.length} jobs.`);
  return normalizeJobsWithCoordinates('LinkedIn', normalized);
}
