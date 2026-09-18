import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectBuiltInCardRowsFromHtml } from './BuiltInAPI.js';

function readFixture(relativePath: string): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return readFileSync(path.join(__dirname, relativePath), 'utf8');
}

describe('collectBuiltInCardRowsFromHtml', () => {
  it('extracts a real BuiltIn listing from the live page into a useful normalized record', () => {
    const html = readFixture('../fixtures/builtin-jobs.html');

    const jobs = collectBuiltInCardRowsFromHtml(html);
    const match = jobs.find((job) => job.sourceUrl.includes('/job/summer-2027-electrical-engineering-co-op-june-2027/10945222'));

    expect(match).toBeTruthy();
    expect(match).toMatchObject({
      title: 'Summer 2027 - Electrical Engineering Co-op (June 2027)',
      company: 'Shield AI',
      sourceUrl: 'https://builtin.com/job/summer-2027-electrical-engineering-co-op-june-2027/10945222',
      remote: 'Unknown',
      type: 'Full-time',
    });
    expect(match?.description).toContain('Shield AI');
    expect(match?.description).toContain('Summer 2027');
  });
});
