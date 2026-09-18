import { describe, expect, it } from 'vitest';
import { sanitizeJobDescription } from './ScrapeDescriptionUtils.js';

describe('sanitizeJobDescription', () => {
  it('decodes entities, strips tags, and preserves word boundaries', () => {
    const raw = '&nbsp;...languages like Go, Rust, Java, or <b>C++.</b>Collaboration &amp; communication...&nbsp;';

    expect(sanitizeJobDescription(raw)).toBe(
      '...languages like Go, Rust, Java, or C++. Collaboration & communication...',
    );
  });

  it('decodes numeric and double-encoded entities', () => {
    expect(sanitizeJobDescription('Salary: &amp;#36;100&#44;000&nbsp;&mdash;&nbsp;great')).toBe(
      'Salary: $100,000 — great',
    );
  });

  it('sanitizes html-encoded job titles for UI labels', () => {
    expect(sanitizeJobDescription('Principal Analytics &amp; AI Engineer')).toBe(
      'Principal Analytics & AI Engineer',
    );
  });
});