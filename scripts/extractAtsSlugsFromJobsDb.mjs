import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.SCRAPED_JOBS_DB_FILE || 'server/cache/scraped_jobs.sqlite');
const genericSlugPath = resolve(process.env.ATS_DISCOVERY_SLUG_FILE || 'server/cache/discovered-company-slugs.txt');
const outputDirectory = resolve(dirname(genericSlugPath), 'ats-discovery');

const patterns = {
  greenhouse: /(?:boards\.greenhouse\.io|boards-api\.greenhouse\.io\/v1\/boards)\/([a-zA-Z0-9_-]+)/g,
  lever: /(?:jobs\.lever\.co|api\.lever\.co\/v0\/postings)\/([a-zA-Z0-9_-]+)/g,
  ashby: /(?:jobs\.ashbyhq\.com|api\.ashbyhq\.com\/posting-api\/job-board)\/([a-zA-Z0-9_-]+)/g,
  workable: /(?:apply\.workable\.com\/|([a-zA-Z0-9_-]+)\.workable\.com\/)([a-zA-Z0-9_-]+)/g,
  smartrecruiters: /(?:jobs|careers)\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/g,
  recruitee: /([a-zA-Z0-9_-]+)\.recruitee\.com/g,
  breezy: /([a-zA-Z0-9_-]+)\.breezy\.hr/g,
  personio: /([a-zA-Z0-9_-]+)\.jobs\.personio\.(?:de|com)/g,
  rippling: /(?:ats\.rippling\.com|api\.rippling\.com\/platform\/api\/job_boards)\/([a-zA-Z0-9_-]+)/g,
};

function normalizeSlug(value) {
  const slug = String(value ?? '').trim().toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
  return /^[a-z0-9][a-z0-9-]{1,99}$/.test(slug) ? slug : null;
}

function extractFromUrl(url, slugsByPlatform) {
  for (const [platform, pattern] of Object.entries(patterns)) {
    pattern.lastIndex = 0;
    for (const match of url.matchAll(pattern)) {
      const slug = normalizeSlug(platform === 'workable' ? match[1] || match[2] : match[1]);
      if (slug) slugsByPlatform[platform].add(slug);
    }
  }
}

async function readSlugFile(filePath) {
  try {
    return (await readFile(filePath, 'utf8')).split(/\r?\n/).map(normalizeSlug).filter(Boolean);
  } catch {
    return [];
  }
}

const database = new DatabaseSync(databasePath, { readOnly: true });
const slugsByPlatform = Object.fromEntries(Object.keys(patterns).map((platform) => [platform, new Set()]));
let rowsScanned = 0;
let urlsScanned = 0;

const rows = database.prepare(`
  SELECT
    json_extract(payload_json, '$.source_url') AS source_url,
    json_extract(payload_json, '$.apply_url') AS apply_url
  FROM scraped_jobs
`).all();

for (const row of rows) {
  rowsScanned += 1;
  const urls = [row.source_url, row.apply_url]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  for (const url of new Set(urls)) {
    urlsScanned += 1;
    extractFromUrl(url, slugsByPlatform);
  }
}
database.close();

await mkdir(outputDirectory, { recursive: true });
for (const [platform, slugs] of Object.entries(slugsByPlatform)) {
  const filePath = resolve(outputDirectory, `${platform}.txt`);
  for (const slug of await readSlugFile(filePath)) slugs.add(slug);
  await writeFile(filePath, `${Array.from(slugs).sort().join('\n')}\n`, 'utf8');
}

console.log(`[AtsSlugDbExtractor] Scanned ${rowsScanned} job records and ${urlsScanned} URLs.`);
console.log(`[AtsSlugDbExtractor] Verified ATS slugs: ${Object.entries(slugsByPlatform).map(([platform, slugs]) => `${platform}=${slugs.size}`).join(', ')}.`);