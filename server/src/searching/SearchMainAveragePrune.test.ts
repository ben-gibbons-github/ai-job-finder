import { describe, expect, it, vi } from 'vitest'
import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import SearchMain from './searchMain/SearchMain.js'

vi.mock('./SearchUtils.js', async () => {
  const actual = await vi.importActual<typeof import('./SearchUtils.js')>('./SearchUtils.js')
  return {
    ...actual,
    jobMatchesQuery: () => true,
    calculateIndividualScores: (job: ScrapedJob) => {
      const score = Number(job.audit_number ?? 0) / 100
      return {
        resume: score,
        impact: 0,
        location: 0,
        fresh: 0,
        audit: 0,
        qualityOfLife: 0,
      }
    },
  }
})

function makeJob(index: number): ScrapedJob {
  return {
    name: `Role ${index}`,
    company_name: `Company ${index}`,
    location: 'Remote',
    remote: 'Remote',
    location_lon: 0,
    location_lat: 0,
    description: 'Test description',
    type: 'Full-time',
    source: 'Test',
    source_url: `https://example.com/job-${index}`,
    posted: '2026-08-01',
    impact_number: 0,
    audit_number: index,
    audit_text: '',
    tags: [],
  }
}

describe('SearchMain two-pass average pruning', () => {
  it('removes jobs below average twice before sorting', async () => {
    const jobs = Array.from({ length: 8 }, (_, i) => makeJob(i + 1))
    const searchMain = new SearchMain()

    const result = await searchMain.search(jobs, {
      query: '',
      resumeText: '',
      locationText: '',
      start: 0,
      end: 100,
    })

    expect(result.size).toBe(2)
    expect(result.matched).toHaveLength(2)
    expect(result.matched[0]?.job.name).toBe('Role 8')
    expect(result.matched[1]?.job.name).toBe('Role 7')
  })
})
