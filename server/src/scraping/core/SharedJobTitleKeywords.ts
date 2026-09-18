import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED_KEYWORDS_FILENAME = 'SharedJobTitleKeywords.txt';

let cachedSharedKeywords: string[] | null = null;

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    const normalized = String(raw ?? '').trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function roundRobinAcrossSections(sections: string[][]): string[] {
  const ordered: string[] = [];
  let index = 0;

  while (true) {
    let hasAny = false;

    for (const section of sections) {
      const next = section[index];
      if (next) {
        ordered.push(next);
        hasAny = true;
      }
    }

    if (!hasAny) {
      break;
    }

    index += 1;
  }

  return uniqueNormalized(ordered);
}

function loadSharedKeywordsFromFile(): string[] {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const sharedFilePath = resolve(currentDir, SHARED_KEYWORDS_FILENAME);
  const fileContents = readFileSync(sharedFilePath, 'utf8');

  const lines = fileContents.split(/\r?\n/);
  const sections: string[][] = [];
  let currentSection: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('#') && line.includes('─')) {
      if (currentSection.length > 0) {
        sections.push(currentSection);
      }
      currentSection = [];
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    const keyword = line.trim();
    if (!keyword) {
      continue;
    }

    currentSection.push(keyword);
  }

  if (currentSection.length > 0) {
    sections.push(currentSection);
  }

  if (sections.length > 1) {
    return roundRobinAcrossSections(sections);
  }

  return uniqueNormalized(lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#')));
}

export function getSharedJobTitleKeywords(fallbackKeywords: string[]): string[] {
  if (cachedSharedKeywords && cachedSharedKeywords.length > 0) {
    return cachedSharedKeywords;
  }

  try {
    const loaded = loadSharedKeywordsFromFile();
    if (loaded.length > 0) {
      cachedSharedKeywords = loaded;
      return loaded;
    }
  } catch (error) {
    console.warn('[SharedJobTitleKeywords] Failed to load shared keyword file:', String(error));
  }

  cachedSharedKeywords = uniqueNormalized(fallbackKeywords);
  return cachedSharedKeywords;
}

export function capKeywords(keywords: string[], maxCount: number): string[] {
  const safeMax = Math.max(1, Number(maxCount || 0));
  return keywords.slice(0, safeMax);
}
