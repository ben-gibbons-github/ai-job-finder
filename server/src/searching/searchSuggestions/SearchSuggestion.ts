import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { SearchSuggestionIndex } from './SearchSuggestionIndex.js'

const searchSuggestionIndex = new SearchSuggestionIndex()

export function rebuildSearchSuggestions(jobs: ScrapedJob[]): void {
  searchSuggestionIndex.rebuildFromJobs(jobs)
}

export function getSearchSuggestions(query: string, limit = 8): string[] {
  return searchSuggestionIndex.suggest(query, limit)
}

export function getSearchSuggestionCount(): number {
  return searchSuggestionIndex.getSuggestionCount()
}
