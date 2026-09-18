import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const scraperName = String(process.argv[2] ?? '').trim();
const scrapeMainPath = resolve('server/src/scraping/core/main/ScrapeJobMain.ts');
const refreshTargetsPath = resolve('server/cache/cachesNeedUpdating.json');

if (!scraperName) {
  throw new Error('Usage: npm run reload-scraper -- <ScraperName>');
}

const scrapeMainSource = await readFile(scrapeMainPath, 'utf8');
const scraperNames = [...scrapeMainSource.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1]);
const selectedName = scraperNames.find((name) => name.toLowerCase() === scraperName.toLowerCase());
if (!selectedName) {
  throw new Error(`Unknown scraper "${scraperName}". Available names: ${scraperNames.join(', ')}`);
}

try {
  const processIds = execFileSync('lsof', ['-ti', ':4000'], { encoding: 'utf8' }).trim();
  if (processIds) {
    execFileSync('kill', ['-9', ...processIds.split(/\s+/)]);
  }
} catch {
  // No server was running.
}

await writeFile(refreshTargetsPath, `${JSON.stringify([selectedName], null, 2)}\n`, 'utf8');
console.log(`Prepared cache refresh for ${selectedName}. Starting server and client.`);

const child = spawn(
  'npx',
  [
    'concurrently',
    '--kill-others',
    '--kill-others-on-fail',
    '-n',
    'server,client',
    '-c',
    'cyan,magenta',
    'npm run dev --prefix server',
    'npm run dev --prefix client',
  ],
  { stdio: 'inherit' },
);
child.on('exit', (code) => process.exitCode = code ?? 1);