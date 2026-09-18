import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output = resolve(process.env.ATS_DISCOVERY_SLUG_FILE || 'server/cache/discovered-company-slugs.txt');
const platformOutputDir = resolve(dirname(output), 'ats-discovery');
const explicitSources = String(process.env.COMPANY_DISCOVERY_SOURCES || '').split(',').map((value) => value.trim()).filter(Boolean);
const githubQueries = String(process.env.COMPANY_DISCOVERY_GITHUB_QUERIES || '"y combinator" companies,"venture capital" portfolio companies,startup company list,companies careers jobs')
  .split(',').map((value) => value.trim()).filter(Boolean);
const maxGithubRepositories = Math.max(1, Math.min(100, Number(process.env.COMPANY_DISCOVERY_MAX_GITHUB_REPOS || 50)));
const maxCompanySites = Math.max(0, Math.min(2_000, Number(process.env.COMPANY_DISCOVERY_MAX_COMPANY_SITES || 250)));
const crawlCompanySites = ['1', 'true', 'yes', 'on'].includes(String(process.env.COMPANY_DISCOVERY_CRAWL_SITES || 'true').toLowerCase());
const githubToken = String(process.env.GITHUB_TOKEN || '').trim();
const githubCodeSearchEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.COMPANY_DISCOVERY_GITHUB_CODE_SEARCH || Boolean(githubToken)).toLowerCase());
const maxGithubCodeFilesPerPlatform = Math.max(1, Math.min(1_000, Number(process.env.COMPANY_DISCOVERY_MAX_GITHUB_CODE_FILES || 1_000)));
const userAgent = 'job-finder-super-slug-harvester/1.0';

const platformPatterns = {
  greenhouse: /(?:https?:)?\/\/(?:boards\.greenhouse\.io|boards-api\.greenhouse\.io\/v1\/boards)\/([a-z0-9-]+)/gi,
  lever: /(?:https?:)?\/\/(?:jobs\.lever\.co|api\.lever\.co\/v0\/postings)\/([a-z0-9-]+)/gi,
  ashby: /(?:https?:)?\/\/(?:jobs\.ashbyhq\.com|api\.ashbyhq\.com\/posting-api\/job-board)\/([a-z0-9-]+)/gi,
  workable: /(?:https?:)?\/\/apply\.workable\.com\/([a-z0-9-]+)/gi,
  recruitee: /(?:https?:)?\/\/([a-z0-9-]+)\.recruitee\.com/gi,
  breezy: /(?:https?:)?\/\/([a-z0-9-]+)\.breezy\.hr/gi,
  personio: /(?:https?:)?\/\/([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/gi,
  rippling: /(?:https?:)?\/\/(?:ats\.rippling\.com|api\.rippling\.com\/platform\/api\/job_boards)\/([a-z0-9-]+)/gi,
  smartrecruiters: /(?:https?:)?\/\/(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9-]+)/gi,
};
const platformSlugs = Object.fromEntries(Object.keys(platformPatterns).map((platform) => [platform, new Set()]));
const domains = new Set();

function normalizeSlug(value) {
  const slug = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
  return /^[a-z0-9][a-z0-9-]{1,99}$/.test(slug) ? slug : null;
}

function addTextCandidates(text) {
  for (const [platform, pattern] of Object.entries(platformPatterns)) {
    for (const match of text.matchAll(pattern)) {
      const slug = normalizeSlug(match[1]);
      if (slug) platformSlugs[platform].add(slug);
    }
  }
  for (const match of text.matchAll(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,62})\.(?:com|io|ai|co|org|net|dev|app)\b/gi)) {
    const domain = String(match[0]).replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
    if (!/(?:github\.com|githubusercontent\.com|google\.com|wikipedia\.org|linkedin\.com|twitter\.com|x\.com)$/i.test(domain)) domains.add(domain);
  }
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'text/html,text/plain,text/csv,application/json', 'User-Agent': userAgent } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function discoverGithubReadmes() {
  const repositories = new Map();
  for (const query of githubQueries) {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', String(Math.min(100, maxGithubRepositories)));
    try {
      const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent } });
      if (!response.ok) throw new Error(String(response.status));
      const payload = await response.json();
      for (const repository of Array.isArray(payload.items) ? payload.items : []) {
        if (repository?.full_name && repository?.default_branch) repositories.set(repository.full_name, repository.default_branch);
        if (repositories.size >= maxGithubRepositories) break;
      }
    } catch (error) {
      console.warn(`[SlugHarvester] GitHub search failed for ${JSON.stringify(query)}: ${String(error)}`);
    }
    if (repositories.size >= maxGithubRepositories) break;
  }
  return Array.from(repositories, ([name, branch]) => `https://raw.githubusercontent.com/${name}/${branch}/README.md`);
}

async function discoverGithubAtsReferences() {
  if (!githubCodeSearchEnabled || !githubToken) {
    if (githubCodeSearchEnabled) console.warn('[SlugHarvester] GitHub code search requires GITHUB_TOKEN; skipping verified ATS URL discovery.');
    return [];
  }

  const sources = new Set();
  for (const [platform, pattern] of Object.entries(platformPatterns)) {
    const searchTerm = pattern.source.includes('greenhouse') ? 'boards.greenhouse.io'
      : pattern.source.includes('lever') ? 'jobs.lever.co'
        : pattern.source.includes('ashby') ? 'jobs.ashbyhq.com'
          : pattern.source.includes('workable') ? 'apply.workable.com'
            : pattern.source.includes('recruitee') ? '.recruitee.com'
              : pattern.source.includes('breezy') ? '.breezy.hr'
                : pattern.source.includes('personio') ? '.jobs.personio.'
                  : pattern.source.includes('rippling') ? 'ats.rippling.com'
                    : 'jobs.smartrecruiters.com';
    const maxPages = Math.ceil(maxGithubCodeFilesPerPlatform / 100);

    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL('https://api.github.com/search/code');
      url.searchParams.set('q', `"${searchTerm}" in:file`);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${githubToken}`, 'User-Agent': userAgent },
        });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          const message = String(errorPayload?.message ?? response.statusText).trim();
          const remaining = response.headers.get('x-ratelimit-remaining');
          const resetAt = response.headers.get('x-ratelimit-reset');
          throw new Error(
            `${response.status} ${message}${remaining ? ` rateLimitRemaining=${remaining}` : ''}${resetAt ? ` rateLimitReset=${resetAt}` : ''}`,
          );
        }
        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        for (const item of items) {
          const repository = item?.repository;
          if (repository?.full_name && repository?.default_branch && item?.path) {
            sources.add(`https://raw.githubusercontent.com/${repository.full_name}/${repository.default_branch}/${item.path}`);
          }
        }
        if (items.length < 100) break;
      } catch (error) {
        console.warn(`[SlugHarvester] GitHub code search failed for ${platform}: ${String(error)}`);
        break;
      }
    }
  }
  return Array.from(sources);
}

async function mapConcurrent(values, limit, callback) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (index < values.length) await callback(values[index++]);
  }));
}

const sources = explicitSources.length > 0
  ? explicitSources
  : [...await discoverGithubReadmes(), ...await discoverGithubAtsReferences()];
let scannedSources = 0;
await mapConcurrent(sources, 8, async (source) => {
  try {
    addTextCandidates(await fetchText(source));
    scannedSources += 1;
  } catch (error) {
    console.warn(`[SlugHarvester] Skipped source: ${String(error)}`);
  }
});

if (crawlCompanySites) {
  const candidateDomains = Array.from(domains).slice(0, maxCompanySites);
  await mapConcurrent(candidateDomains, 10, async (domain) => {
    for (const path of ['', '/careers', '/jobs']) {
      try {
        addTextCandidates(await fetchText(`https://${domain}${path}`));
        break;
      } catch {
        // Missing or blocked paths are normal; try the next public career URL.
      }
    }
  });
}

const genericSlugs = new Set([...domains].map((domain) => normalizeSlug(domain.split('.')[0])).filter(Boolean));
for (const slugs of Object.values(platformSlugs)) for (const slug of slugs) genericSlugs.add(slug);
await mkdir(platformOutputDir, { recursive: true });
await writeFile(output, `${Array.from(genericSlugs).sort().join('\n')}\n`, 'utf8');
for (const [platform, slugs] of Object.entries(platformSlugs)) {
  await writeFile(resolve(platformOutputDir, `${platform}.txt`), `${Array.from(slugs).sort().join('\n')}\n`, 'utf8');
}
console.log(`[SlugHarvester] General candidates=${genericSlugs.size}; scanned sources=${scannedSources}/${sources.length}; crawled sites=${crawlCompanySites ? Math.min(domains.size, maxCompanySites) : 0}.`);
console.log(`[SlugHarvester] Verified ATS slugs: ${Object.entries(platformSlugs).map(([platform, slugs]) => `${platform}=${slugs.size}`).join(', ')}.`);