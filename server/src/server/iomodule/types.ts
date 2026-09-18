import { type Server } from 'socket.io'

import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import type { ScrapeLoadDebugStats } from '../../scraping/core/ScrapeDebugTelemetry.js'
import SearchMain from '../../searching/searchMain/SearchMain.js'
import { Top100Search } from '../../searching/Top100Search.js'
import type { TagCloudEntry } from '../TagCloud.js'
import type { ServerDebugCoverageStats } from '../../utils/debugStats/DebugStats.js'

export interface RegisterIOModuleOptions {
  io: Server
  searchMain: SearchMain
  top100Search: Top100Search
  getJobs: () => ScrapedJob[]
  getScrapeLoadDebugStats: () => ScrapeLoadDebugStats | null
  getDebugCoverageStats: () => ServerDebugCoverageStats | null
  getCachedTagCloud: () => TagCloudEntry[]
  searchDebugEnabled: boolean
  auditEnabled: boolean
  isProduction: boolean
}
