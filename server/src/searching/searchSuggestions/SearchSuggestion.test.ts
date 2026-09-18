import { beforeEach, describe, expect, it } from 'vitest';
import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';
import { getSearchSuggestions, rebuildSearchSuggestions } from './SearchSuggestion.js';

function makeJob(name: string, companyName: string): ScrapedJob {
  return {
    name,
    company_name: companyName,
    location: 'Remote',
    remote: 'Remote',
    location_lon: 0,
    location_lat: 0,
    description: '',
    type: 'Full-time',
    source: 'Test',
    source_url: `https://example.com/${name}-${companyName}`,
    posted: '2026-08-18',
    impact_number: 0,
    audit_number: 0,
    audit_text: '',
    tags: [],
  };
}

describe('search suggestions', () => {
  beforeEach(() => {
    rebuildSearchSuggestions([
      makeJob('Systems Engineer', 'Lockheed Martin'),
      makeJob('Security Analyst', 'Lockheed Martin'),
      makeJob('Product Manager', 'Acme Labs'),
      makeJob('Support Engineer', 'Unknown Company'),
    ]);
  });

  it('suggests a company name from its beginning', () => {
    expect(getSearchSuggestions('lockheed')).toContain('Lockheed Martin');
  });

  it('suggests a company name from a later word', () => {
    expect(getSearchSuggestions('martin')).toContain('Lockheed Martin');
  });

  it('keeps title suggestions and excludes placeholder companies', () => {
    expect(getSearchSuggestions('systems')).toContain('Systems Engineer');
    expect(getSearchSuggestions('unknown')).not.toContain('Unknown Company');
  });

  it('sorts lower word counts before higher word counts when scores tie', () => {
    rebuildSearchSuggestions([
      makeJob('Solar AI Ops', 'SunGrid'),
      makeJob('Solar Capacity', 'SunGrid'),
      makeJob('Solar Quality Control', 'SunGrid'),
      makeJob('Solar', 'SunGrid'),
    ]);

    const suggestions = getSearchSuggestions('solar', 10);
    expect(suggestions.indexOf('Solar')).toBeLessThan(suggestions.indexOf('Solar Capacity'));
    expect(suggestions.indexOf('Solar Capacity')).toBeLessThan(suggestions.indexOf('Solar AI Ops'));
    expect(suggestions.indexOf('Solar AI Ops')).toBeLessThan(suggestions.indexOf('Solar Quality Control'));
  });
});