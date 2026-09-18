import { describe, expect, it, vi } from 'vitest'
import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import SearchMain from './searchMain/SearchMain.js'
import { Top100Search } from './Top100Search.js'

function makeJob(): ScrapedJob {
  return {
    name: 'Newly Loaded Engineer',
    company_name: 'New Corpus Company',
    location: 'Remote',
    remote: 'Remote',
    location_lon: 0,
    location_lat: 0,
    description: 'A newly loaded role',
    type: 'Full-time',
    source: 'Test',
    source_url: 'https://example.com/newly-loaded-role',
    posted: '2026-08-18',
    impact_number: 0,
    audit_number: 0,
    audit_text: '',
    tags: [],
  }
}

describe('search cache invalidation', () => {
  it('does not reuse results cached before the complete job corpus loaded', async () => {
    const searchMain = new SearchMain()
    const payload = {
      query: 'newly',
      resumeText: '',
      locationText: '',
      start: 0,
      end: 100,
    }

    expect((await searchMain.search([], payload)).size).toBe(0)

    searchMain.clearCache()

    const refreshed = await searchMain.search([makeJob()], payload)
    expect(refreshed.size).toBe(1)
    expect(refreshed.matched[0]?.job.company_name).toBe('New Corpus Company')
  })

  it('clears the cached initial search response', async () => {
    const search = vi.fn().mockResolvedValue({ matched: [], size: 0, meta: undefined })
    const top100Search = new Top100Search({ search } as unknown as SearchMain)

    await top100Search.refresh([])
    expect(top100Search.getCached()).not.toBeNull()

    top100Search.clearCache()
    expect(top100Search.getCached()).toBeNull()
  })
})