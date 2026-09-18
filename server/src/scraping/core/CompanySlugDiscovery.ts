import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsvEnv } from './PortalIngestionUtils.js';

const DEFAULT_MAX_DISCOVERY_SLUGS = 20_000;

function normalizeSlug(value: string): string | null {
  const candidate = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/, 1)[0]
    .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return /^[a-z0-9][a-z0-9-]{1,99}$/.test(candidate) ? candidate : null;
}

function readDiscoveryFile(platform?: string): string[] {
  const genericFilePath = String(
    process.env.ATS_DISCOVERY_SLUG_FILE || 'server/cache/discovered-company-slugs.txt',
  ).trim();
  const platformFilePath = platform
    ? path.join(path.dirname(genericFilePath), 'ats-discovery', `${platform.toLowerCase()}.txt`)
    : '';
  const filePaths = platformFilePath && existsSync(platformFilePath)
    ? [platformFilePath]
    : [genericFilePath];
  const values: string[] = [];

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    try {
      values.push(...readFileSync(filePath, 'utf8').split(/\r?\n/));
    } catch (error) {
      console.warn(`[CompanySlugDiscovery] Could not read ${filePath}:`, String(error));
    }
  }

  return values;
}

/** Returns bounded, normalized candidates harvested from public company lists. */
export function getDiscoveredCompanySlugs(platform?: string): string[] {
  const values = [
    ...parseCsvEnv(process.env.ATS_DISCOVERY_SLUGS),
    ...parseCsvEnv(process.env.ATS_DISCOVERY_DOMAINS),
    ...readDiscoveryFile(platform),
  ];
  const maxSlugs = Math.max(0, Number(process.env.ATS_DISCOVERY_MAX_SLUGS || DEFAULT_MAX_DISCOVERY_SLUGS));
  const deduped = new Set<string>();

  for (const value of values) {
    const slug = normalizeSlug(value);
    if (slug) {
      deduped.add(slug);
    }
    if (deduped.size >= maxSlugs) {
      break;
    }
  }

  return Array.from(deduped);
}