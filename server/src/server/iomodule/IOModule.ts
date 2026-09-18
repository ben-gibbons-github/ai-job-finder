import { type Server } from 'socket.io'

import { emitInitialSocketState } from './emitInitialState.js'
import { registerSocketHandlers } from './registerSocketHandlers.js'
import type { RegisterIOModuleOptions } from './types.js'

export function registerIOModule(options: RegisterIOModuleOptions): void {
  const {
    io,
    searchMain,
    top100Search,
    getJobs,
    getScrapeLoadDebugStats,
    getDebugCoverageStats,
    getCachedTagCloud,
    searchDebugEnabled,
    auditEnabled,
    isProduction,
  } = options

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`)

    const jobs = getJobs()
    const scrapeLoadDebugStats = getScrapeLoadDebugStats()

    emitInitialSocketState({
      socket,
      jobs,
      scrapeLoadDebugStats,
      getDebugCoverageStats,
      getCachedTagCloud,
      searchDebugEnabled,
      auditEnabled,
      top100Search,
      getJobs,
    })

    registerSocketHandlers({
      socket,
      searchMain,
      getJobs,
      searchDebugEnabled,
      isProduction,
    })
  })
}
