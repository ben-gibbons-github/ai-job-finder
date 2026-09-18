import type { Socket } from 'socket.io'

import { isLlmBatchAsyncEnabled } from '../../llms/LlmBatchRequestStore.js'
import { type ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { collectPromptVersions } from '../StartupLogic.js'
import { computeServerDebugCoverageStats, summarizeJobCorpus, withLiveCacheIoSummary, type ServerDebugCoverageStats } from '../../utils/debugStats/DebugStats.js'
import type { ScrapeLoadDebugStats } from '../../scraping/core/ScrapeDebugTelemetry.js'
import type { TagCloudEntry } from '../TagCloud.js'
import { buildTagCloud } from '../TagCloud.js'
import { Top100Search } from '../../searching/Top100Search.js'
import { logBackgroundTaskEnd, logBackgroundTaskStart } from '../../utils/BackgroundTaskTiming.js'

let lazyTagCloud: TagCloudEntry[] | null = null

interface EmitInitialSocketStateOptions {
  socket: Socket
  jobs: ScrapedJob[]
  scrapeLoadDebugStats: ScrapeLoadDebugStats | null
  getDebugCoverageStats: () => ServerDebugCoverageStats | null
  getCachedTagCloud: () => TagCloudEntry[]
  searchDebugEnabled: boolean
  auditEnabled: boolean
  top100Search: Top100Search
  getJobs: () => ScrapedJob[]
}

export function emitInitialSocketState(options: EmitInitialSocketStateOptions): void {
  const {
    socket,
    jobs,
    scrapeLoadDebugStats,
    getDebugCoverageStats,
    getCachedTagCloud,
    searchDebugEnabled,
    auditEnabled,
    top100Search,
    getJobs,
  } = options

  const debugCoverage = searchDebugEnabled && scrapeLoadDebugStats
    ? withLiveCacheIoSummary(getDebugCoverageStats() ?? computeServerDebugCoverageStats(jobs, scrapeLoadDebugStats))
    : undefined
  const debugPromptVersions = searchDebugEnabled ? collectPromptVersions(jobs) : undefined

  socket.emit('server:config', {
    auditEnabled,
    llmBatchAsyncEnabled: isLlmBatchAsyncEnabled(),
    ...summarizeJobCorpus(jobs),
    searchDebugEnabled,
    ...(debugCoverage ? { debugCoverage } : {}),
    ...(debugPromptVersions ? { promptVersions: debugPromptVersions } : {}),
  })

  const cachedTagCloud = getCachedTagCloud()
  if (cachedTagCloud.length > 0) {
    socket.emit('server:tagCloud', cachedTagCloud)
  }

  socket.on('tagCloud:request', () => {
    const entries = cachedTagCloud.length > 0
      ? cachedTagCloud
      : (lazyTagCloud ?? (lazyTagCloud = buildTagCloud(getJobs(), 500)))
    socket.emit('server:tagCloud', entries)
  })

  socket.on('scoreDistribution:request', () => {
    const cached = top100Search.getCached()
    if (cached?.meta) {
      socket.emit('server:scoreDistribution', cached.meta)
      return
    }

    void top100Search.getOrBuild(getJobs()).then((response) => {
      if (response?.meta) {
        socket.emit('server:scoreDistribution', response.meta)
      }
    })
  })

  socket.on('search:initial', () => {
    const cachedDefaultSearchResponse = top100Search.getCached()
    if (cachedDefaultSearchResponse) {
      socket.emit('search:results', { ...cachedDefaultSearchResponse, isInitialResponse: true })
      return
    }

    void (async () => {
      const initialStateTaskStart = logBackgroundTaskStart('EmitInitialState:buildDefaultSearch')
      try {
        const top100BuildStart = logBackgroundTaskStart('EmitInitialState:top100Search.getOrBuild')
        const cached = await top100Search.getOrBuild(getJobs())
        logBackgroundTaskEnd('EmitInitialState:top100Search.getOrBuild', top100BuildStart, {
          hasCached: Boolean(cached),
        })
        if (cached) {
          socket.emit('search:results', { ...cached, isInitialResponse: true })
        }
        logBackgroundTaskEnd('EmitInitialState:buildDefaultSearch', initialStateTaskStart, {
          hasCached: Boolean(cached),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Failed to build default cached search for new client: ${message}`)
        logBackgroundTaskEnd('EmitInitialState:buildDefaultSearch', initialStateTaskStart, {
          error: message,
        })
      }
    })()
  })
}
