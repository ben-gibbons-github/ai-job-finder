import type { Socket } from 'socket.io'

import type SearchMain from '../../searching/searchMain/SearchMain.js'
import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { registerRerollAiDebugHandler } from '../RerollAiDebug.js'
import { registerSearchSocketOn } from './ioOnSearch.js'
import { registerSearchSuggestionsSocketOn } from './ioOnSearchSuggestions.js'
import { registerLocationsSearchSocketOn } from './ioOnLocationsSearch.js'
import { registerDisconnectSocketOn } from './ioOnDisconnect.js'

interface RegisterSocketHandlersOptions {
  socket: Socket
  searchMain: SearchMain
  getJobs: () => ScrapedJob[]
  searchDebugEnabled: boolean
  isProduction: boolean
}

export function registerSocketHandlers(options: RegisterSocketHandlersOptions): void {
  const {
    socket,
    searchMain,
    getJobs,
    searchDebugEnabled,
    isProduction,
  } = options

  registerSearchSocketOn({
    socket,
    searchMain,
    getJobs,
    searchDebugEnabled,
    isProduction,
  })

  registerSearchSuggestionsSocketOn({ socket })
  registerLocationsSearchSocketOn({ socket })
  registerDisconnectSocketOn({ socket })

  registerRerollAiDebugHandler(socket, {
    searchDebugEnabled,
    getJobs,
  })
}
