import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import SearchMain, { type SearchPayload, type RankedJobWrapper, type SearchResultMeta } from './searchMain/SearchMain.js'

export interface Top100SearchResponse {
  results: RankedJobWrapper[]
  total: number
  meta?: SearchResultMeta
}

export class Top100Search {
  private cachedResponse: Top100SearchResponse | null = null

  constructor(
    private readonly searchMain: SearchMain,
    private readonly limit: number = 100,
  ) {}

  getCached(): Top100SearchResponse | null {
    if (this.cachedResponse) {
      console.log(
        `[Top100Search] Cache hit: ${this.cachedResponse.results.length}/${this.cachedResponse.total} results available.`,
      )
    } else {
      console.log('[Top100Search] Cache miss: no cached top-100 response yet.')
    }
    return this.cachedResponse
  }

  clearCache(): void {
    this.cachedResponse = null
  }

  async refresh(jobs: ScrapedJob[]): Promise<Top100SearchResponse> {
    console.log(`[Top100Search] Refresh started for ${jobs.length} jobs (limit=${this.limit}).`)

    const payload: SearchPayload = {
      query: '',
      locationText: '',
      resumeText: '',
      start: 0,
      end: this.limit,
    }

    const results = await this.searchMain.search(jobs, payload)
    this.cachedResponse = {
      results: results.matched,
      total: results.size,
      meta: results.meta,
    }

    console.log(
      `[Top100Search] Refresh completed: cached ${this.cachedResponse.results.length}/${this.cachedResponse.total} results.`,
    )

    return this.cachedResponse
  }

  async getOrBuild(jobs: ScrapedJob[]): Promise<Top100SearchResponse | null> {
    if (this.cachedResponse) {
      console.log('[Top100Search] getOrBuild using existing cached response.')
      return this.cachedResponse
    }

    if (jobs.length === 0) {
      console.log('[Top100Search] getOrBuild skipped: no jobs available yet.')
      return null
    }

    console.log('[Top100Search] getOrBuild rebuilding cache because none exists.')

    return this.refresh(jobs)
  }
}
