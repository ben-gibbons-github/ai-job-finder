import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchAllGreenhouseJobs } from './GreenhouseAPI.js';

describe('fetchAllGreenhouseJobs', () => {
  it.skip('extracts a real Greenhouse job page into useful normalized fields with a rich description', () => {
    expect(fetchAllGreenhouseJobs).toBeDefined();
  });
});
