import { describe, expect, it } from 'vitest';
import { collectBuiltInCompanyJobPairsFromHtml } from './BuiltInSocialImpactAPI.js';

describe('collectBuiltInCompanyJobPairsFromHtml', () => {
  it('pairs a job link with the nearest company link and strips logo suffixes', () => {
    const html = `
      <section>
        <a href="/company/headway">Headway Logo</a>
        <a href="/company/headway">Headway</a>
        <a href="/job/software-engineer/10754388">Software Engineer</a>
      </section>
    `;

    expect(collectBuiltInCompanyJobPairsFromHtml(html)).toEqual([
      expect.objectContaining({
        title: 'Software Engineer',
        company: 'Headway',
        sourceUrl: 'https://builtin.com/job/software-engineer/10754388',
      }),
    ]);
  });

  it('can pair a job link with a nearby following company link', () => {
    const html = `
      <section>
        <a href="/job/contracts-attorney/9956115">Contracts Attorney</a>
        <div>Reposted 6 Hours Ago</div>
        <a href="/company/brainpop">BrainPOP</a>
      </section>
    `;

    expect(collectBuiltInCompanyJobPairsFromHtml(html)).toEqual([
      expect.objectContaining({
        title: 'Contracts Attorney',
        company: 'BrainPOP',
        sourceUrl: 'https://builtin.com/job/contracts-attorney/9956115',
      }),
    ]);
  });
});