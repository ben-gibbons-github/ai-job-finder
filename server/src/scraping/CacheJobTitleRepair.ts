import type { ScrapedJob } from './ScrapedJob.js';

const GENERIC_PATH_SEGMENTS = new Set([
  'job',
  'jobs',
  'search',
  'members',
  'member',
  'positions',
  'position',
  'careers',
  'career',
  'listing',
  'listings',
  'view',
  'postings',
  'posting',
  'opportunity',
  'opportunities',
]);

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toComparableForms(source: string, sourceUrl: string): Set<string> {
  const forms = new Set<string>();

  const sourceValue = String(source || '').trim();
  if (sourceValue) {
    forms.add(normalizeToken(sourceValue));
    forms.add(normalizeToken(sourceValue.replace(/([a-z])([A-Z])/g, '$1 $2')));
  }

  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    const hostNoPrefix = hostname.replace(/^www\./, '');
    const hostBase = hostNoPrefix.split('.')[0] || '';
    if (hostNoPrefix) {
      forms.add(normalizeToken(hostNoPrefix));
    }
    if (hostBase) {
      forms.add(normalizeToken(hostBase));
      forms.add(normalizeToken(hostBase.replace(/([a-z])([A-Z])/g, '$1 $2')));
    }
  } catch {
    // Ignore malformed URLs.
  }

  forms.delete('');
  return forms;
}

function titleLooksGeneric(job: ScrapedJob): boolean {
  const title = String(job.name || '').trim();
  if (!title) {
    return true;
  }

  const normalizedTitle = normalizeToken(title);
  if (!normalizedTitle) {
    return true;
  }

  if (normalizedTitle === 'job' || normalizedTitle === 'jobs' || normalizedTitle === 'unknownrole') {
    return true;
  }

  const sourceForms = toComparableForms(String(job.source || ''), String(job.source_url || ''));
  if (sourceForms.has(normalizedTitle)) {
    return true;
  }

  for (const sourceForm of sourceForms) {
    if (!sourceForm) {
      continue;
    }
    if (normalizedTitle === `${sourceForm}com` || normalizedTitle === `${sourceForm}org` || normalizedTitle === `${sourceForm}net`) {
      return true;
    }
  }

  if (normalizedTitle.endsWith('jobs')) {
    const withoutJobs = normalizedTitle.slice(0, -4);
    if (sourceForms.has(withoutJobs)) {
      return true;
    }
  }

  return false;
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && /^[A-Z0-9]+$/.test(word)) {
        return word;
      }
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .trim();
}

function deriveTitleFromSourceUrl(sourceUrl: string): string {
  let pathname = '';
  try {
    pathname = new URL(sourceUrl).pathname || '';
  } catch {
    return '';
  }

  const segments = pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment.trim()))
    .filter(Boolean)
    .filter((segment) => !GENERIC_PATH_SEGMENTS.has(segment.toLowerCase()));

  if (segments.length === 0) {
    return '';
  }

  let slug = segments[segments.length - 1] || '';
  if (/^\d+$/.test(slug) && segments.length > 1) {
    slug = segments[segments.length - 2] || slug;
  }

  slug = slug
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\d{5,}\b/g, ' ')
    .trim();

  if (!slug) {
    return '';
  }

  const candidate = toTitleCase(slug);
  if (!candidate) {
    return '';
  }

  return candidate;
}

export interface CacheTitleRepairResult {
  jobs: ScrapedJob[];
  correctedCount: number;
}

export function repairGenericCachedJobTitles(componentName: string, jobs: ScrapedJob[]): CacheTitleRepairResult {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { jobs: [], correctedCount: 0 };
  }

  let correctedCount = 0;

  const repairedJobs = jobs.map((job) => {
    if (!titleLooksGeneric(job)) {
      return job;
    }

    const derivedTitle = deriveTitleFromSourceUrl(String(job.source_url || ''));
    if (!derivedTitle) {
      return job;
    }

    const normalizedDerived = normalizeToken(derivedTitle);
    const sourceForms = toComparableForms(String(job.source || componentName), String(job.source_url || ''));
    if (!normalizedDerived || sourceForms.has(normalizedDerived)) {
      return job;
    }

    correctedCount += 1;
    return {
      ...job,
      name: derivedTitle,
    };
  });

  return {
    jobs: repairedJobs,
    correctedCount,
  };
}
