import { describe, expect, it } from 'vitest'
import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import { calculateResumeScore } from './SearchResumeMatch.js'

describe('SearchResumeMatch title weighting', () => {
  it('weights the job title 10x and penalizes missed titles strongly', () => {
    const job: ScrapedJob = {
      name: 'Senior Software Engineer',
      company_name: 'Acme',
      location: 'Remote',
      remote: 'Remote',
      location_lon: 0,
      location_lat: 0,
      description: 'We build backend services and hire experienced engineers',
      type: 'Full-time',
      source: 'Test',
      source_url: 'https://example.com/job-title-weighting',
      posted: '2026-08-01',
      impact_number: 0,
      audit_number: 0,
      audit_text: '',
      tags: [],
    }

    const exactTitleScore = calculateResumeScore(job, 'senior software engineer backend services experienced engineers')
    const missingTitleScore = calculateResumeScore(job, 'backend services experienced engineers')

    expect(exactTitleScore).toBeGreaterThan(0.9)
    expect(missingTitleScore).toBeLessThan(0.25)
    expect(exactTitleScore).toBeGreaterThan((missingTitleScore ?? 0) * 3)
  })
})
