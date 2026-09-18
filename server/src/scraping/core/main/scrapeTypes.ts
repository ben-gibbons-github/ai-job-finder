import type { ScrapeLoadDebugStats } from '../ScrapeDebugTelemetry.js'
import type { ScrapedJob } from '../ScrapedJob.js'

export interface ScrapeJobsProgress {
  jobs: ScrapedJob[]
  scrapeLoadDebugStats: ScrapeLoadDebugStats
}

export interface ScrapeJobsOptions {
  onProgress?: (progress: ScrapeJobsProgress) => void
}
