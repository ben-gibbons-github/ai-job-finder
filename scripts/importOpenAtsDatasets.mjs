import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output = resolve(process.env.ATS_DISCOVERY_SLUG_FILE || 'server/cache/discovered-company-slugs.txt');
const outputDirectory = resolve(dirname(output), 'ats-discovery');
const sources = [
  'https://raw.githubusercontent.com/outscal/OpenJobs/main/data/companies_v2.json',
  'https://raw.githubusercontent.com/elliottdehn/open-jobs/main/slugs.json',
];
const supportedPlatforms = new Set(['greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'breezy', 'personio', 'rippling', 'smartrecruiters']);
const slugsByPlatform = Object.fromEntries([...supportedPlatforms].map((platform) => [platform, new Set()]));

const urlPatterns = {
  greenhouse: /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9_-]+)/gi,
  lever: /jobs\.lever\.co\/([a-z0-9_-]+)/gi,
  ashby: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/gi,
  workable: /apply\.workable\.com\/([a-z0-9_-]+)/gi,
  recruitee: /([a-z0-9_-]+)\.recruitee\.com/gi,
  breezy: /([a-z0-9_-]+)\.breezy\.hr/gi,
  personio: /([a-z0-9_-]+)\.jobs\.personio\.(?:de|com)/gi,
  rippling: /ats\.rippling\.com\/([a-z0-9_-]+)/gi,
  smartrecruiters: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/gi,
};

function normalizeSlug(value) {
  const slug = String(value ?? '').trim().toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
  return /^[a-z0-9][a-z0-9-]{1,99}$/.test(slug) ? slug : null;
}

function addUrl(url) {
  for (const [platform, pattern] of Object.entries(urlPatterns)) {
    pattern.lastIndex = 0;
    for (const match of String(url ?? '').matchAll(pattern)) {
      const slug = normalizeSlug(match[1]);
      if (slug) slugsByPlatform[platform].add(slug);
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { Accept: 'application/json', 'User-Agent': 'job-finder-super-ats-importer/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function readExistingSlugs(filePath) {
  try {
    return (await readFile(filePath, 'utf8')).split(/\r?\n/).map(normalizeSlug).filter(Boolean);
  } catch {
    return [];
  }
}

const [openJobs, openJobsSlugs] = await Promise.all(sources.map(fetchJson));
for (const company of Array.isArray(openJobs) ? openJobs : []) {
  for (const url of Array.isArray(company?.ats_links) ? company.ats_links : []) addUrl(url);
}
for (const [platform, slugs] of Object.entries(openJobsSlugs?.ats ?? {})) {
  if (!supportedPlatforms.has(platform) || !Array.isArray(slugs)) continue;
  for (const value of slugs) {
    const slug = normalizeSlug(value);
    if (slug) slugsByPlatform[platform].add(slug);
  }
}

await mkdir(outputDirectory, { recursive: true });
for (const [platform, slugs] of Object.entries(slugsByPlatform)) {
  const filePath = resolve(outputDirectory, `${platform}.txt`);
  for (const slug of await readExistingSlugs(filePath)) slugs.add(slug);
  await writeFile(filePath, `${Array.from(slugs).sort().join('\n')}\n`, 'utf8');
}

console.log(`[OpenAtsImporter] Imported OpenJobs companies=${Array.isArray(openJobs) ? openJobs.length : 0}.`);
console.log(`[OpenAtsImporter] Verified ATS slugs: ${Object.entries(slugsByPlatform).map(([platform, slugs]) => `${platform}=${slugs.size}`).join(', ')}.`);