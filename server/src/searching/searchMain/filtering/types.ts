import type { ScrapedJob } from '../../../scraping/core/ScrapedJob.js'
import type { SearchLogFlags, SearchPayload, UserRatingMode } from '../../SearchInterfaces.js'

export type { SearchLogFlags, SearchPayload }

export interface SearchFilterAndMatchResult {
  includeRemoteJobs: boolean
  userRatingMode: UserRatingMode
  promptVersionFilter: string
  hiddenJobUrls: Set<string>
  hiddenCompanies: Set<string>
  jobsForSearch: ScrapedJob[]
  matched: ScrapedJob[]
  preFilteredJobs: ScrapedJob[]
  companyRatingMap: Map<string, number>
  filterMs: number
  queryMatchMs: number
}

export interface RunFilteringInput {
  jobs: ScrapedJob[]
  searchPayload: SearchPayload
  rawQuery: string
  queryTerms: string[]
  logFlags: SearchLogFlags
  logSearchMain: boolean
  hiddenExclusionsEnabled: boolean
}

export interface FilteringContext {
  includeRemoteJobs: boolean
  userRatingMode: UserRatingMode
  promptVersionFilter: string
  sourceSearchCountry: string | null
  preserveRatedBeyondLimit: boolean
  companyRatingMap: Map<string, number>
  ratedCompanies: Set<string>
  hiddenJobUrls: Set<string>
  hiddenCompanies: Set<string>
}
