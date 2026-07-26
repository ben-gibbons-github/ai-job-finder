import 'dotenv/config'

import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import { Server, type Socket } from 'socket.io'

import type { ScrapedJob } from './scraping/ScrapedJob.js'
import { scrapeJobsMain } from './scraping/ScrapeJobMain.js'
import { searchLocationsOpenStreetMap, type LocationOption } from './searching/LocationSearch.js'
import { getSearchSuggestionCount, getSearchSuggestions, rebuildSearchSuggestions } from './searching/SearchSuggestion.js'
import SearchMain, { type SearchPayload, type RankedJobWrapper, type SearchResultMeta } from './searching/SearchMain.js'
import { Top100Search } from './searching/Top100Search.js'
import { auditJobAsync, type AuditResult } from './searching/SearchAudit.js'
import { impactJobAIAsync, type ImpactAIResult } from './searching/SearchImpactAI.js'
import { qualityOfLifeJobAsync } from './searching/SearchQualityOfLife.js'
import {
  callbackRateLimitError,
  clearSocketRateLimitState,
  consumeLeakyBucket,
  emitRateLimitError,
} from './utils/RateLimit.js'

const AI_AUDIT_ALL_COMMAND = 'AIAuditAllJobsInThisSearch' as const
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const AUDIT_ALL_MAX_CONCURRENCY = Math.max(1, Number(process.env.AUDIT_ALL_MAX_CONCURRENCY ?? 4))
const AUDIT_ALL_MAX_JOBS = Math.max(1, Number(process.env.AUDIT_ALL_MAX_JOBS ?? 250))
const SHUTDOWN_TIMEOUT_MS = Math.max(1000, Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000))
const MEMORY_HEARTBEAT_MS = 5000

// Global job list
let JOBS: ScrapedJob[] = []
const searchMain = new SearchMain()
const top100Search = new Top100Search(searchMain)

;(async () => {
  try {
    // Log cache directory contents for startup verification
    const cacheDir = path.resolve(import.meta.dirname, '../../cache')
    if (existsSync(cacheDir)) {
      const files = readdirSync(cacheDir)
      const totalBytes = files.reduce((sum, f) => {
        try { return sum + statSync(path.join(cacheDir, f)).size } catch { return sum }
      }, 0)
      console.log(`[Cache] ${cacheDir} — ${files.length} file(s), ${(totalBytes / 1_048_576).toFixed(1)} MB`)
    } else {
      console.warn(`[Cache] Directory not found: ${cacheDir}`)
    }

    JOBS = await scrapeJobsMain()
    console.log(`Loaded ${JOBS.length} jobs at startup.`)
    rebuildSearchSuggestions(JOBS)
    console.log(`Built search suggestion index with ${getSearchSuggestionCount()} unique terms.`)
    const cached = await top100Search.refresh(JOBS)
    console.log(`Built default cached search results: ${cached.results.length}/${cached.total}`)
  } catch (err) {
    console.error('Failed to scrape jobs on startup:', err)
  }
})()

const PORT = Number(process.env.PORT) || 4000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3010'
const CLIENT_DIST_DIR = process.env.CLIENT_DIST_DIR || path.resolve(process.cwd(), '../client/dist')

const app = express()

app.use(cors({ origin: CLIENT_ORIGIN }))

app.get('/api/hello', (_req, res) => {
  res.json({ message: 'Hello from Express + Socket.IO server!' })
})

if (existsSync(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR))

  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html'))
  })
}

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
  },
})

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1

      if (index >= items.length) {
        return
      }

      await worker(items[index])
    }
  })

  await Promise.all(workers)
}

async function emitJobInsights(socket: Socket, job: ScrapedJob): Promise<void> {
  const [auditResult, qolResult, impactResult] = await Promise.allSettled([
    auditJobAsync(job, true),
    qualityOfLifeJobAsync(job, true),
    impactJobAIAsync(job, true),
  ])

  if (auditResult.status === 'fulfilled') {
    socket.emit('job:audit:result', { source_url: job.source_url, ...auditResult.value })
  } else {
    console.error(`Audit failed for ${job.source_url}: ${String(auditResult.reason)}`)
  }

  if (qolResult.status === 'fulfilled') {
    socket.emit('job:qualityOfLife:result', { source_url: job.source_url, ...qolResult.value })
  } else {
    console.error(`Quality-of-life scoring failed for ${job.source_url}: ${String(qolResult.reason)}`)
  }

  if (impactResult.status === 'fulfilled') {
    socket.emit('job:impact:result', {
      source_url: job.source_url,
      ai_impact_score: impactResult.value.impactScore,
      ai_impact_summary: impactResult.value.impactSummary,
      impactScore: impactResult.value.impactScore,
      impactSummary: impactResult.value.impactSummary,
      error: impactResult.value.error,
    })
  } else {
    console.error(`Impact scoring failed for ${job.source_url}: ${String(impactResult.reason)}`)
  }
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)

  socket.emit('server:hello', 'Hello from Socket.IO server!')

  const cachedDefaultSearchResponse = top100Search.getCached()
  if (cachedDefaultSearchResponse) {
    socket.emit('search:results', { ...cachedDefaultSearchResponse, isInitialResponse: true })
  } else {
    // Build and send the default results once jobs are available and cache is ready.
    ;(async () => {
      try {
        const cached = await top100Search.getOrBuild(JOBS)
        if (cached) {
          socket.emit('search:results', { ...cached, isInitialResponse: true })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Failed to build default cached search for new client: ${message}`)
      }
    })()
  }

  socket.on(
    'search',
    async (
      payload: SearchPayload,
      callback?: (response: { results: RankedJobWrapper[]; total: number; meta?: SearchResultMeta; error?: string }) => void,
    ) => {
      if (!consumeLeakyBucket(socket.id, 'search')) {
        emitRateLimitError(socket, 'search')
        callbackRateLimitError(callback, {
          results: [],
          total: 0,
          meta: undefined,
          error: 'Rate limit exceeded for search',
        })
        return
      }

      if (payload?.command === AI_AUDIT_ALL_COMMAND && !consumeLeakyBucket(socket.id, 'search:auditAll')) {
        emitRateLimitError(socket, 'search:auditAll')
        callbackRateLimitError(callback, {
          results: [],
          total: 0,
          meta: undefined,
          error: 'Rate limit exceeded for audit-all command',
        })
        return
      }

      try {
        const results = await searchMain.search(JOBS, payload)
        const response = {
          results: results.matched,
          total: results.size,
          meta: results.meta,
        }

        if (!IS_PRODUCTION) {
          console.log('payload?.command', payload?.command)
        }
        if (payload?.command === AI_AUDIT_ALL_COMMAND) {
          const fullSearchPayload: SearchPayload = {
            ...payload,
            start: -1,
            end: -1,
          }
          const fullResults = await searchMain.search(JOBS, fullSearchPayload)
          const jobsToAudit = fullResults.matched.map((wrapper) => wrapper.job)
          const cappedJobs = jobsToAudit.slice(0, AUDIT_ALL_MAX_JOBS)

          if (jobsToAudit.length > AUDIT_ALL_MAX_JOBS) {
            console.warn(
              `[Search] Audit-all capped at ${AUDIT_ALL_MAX_JOBS} jobs (matched: ${jobsToAudit.length})`,
            )
          }

          console.log(`[Search] Running audit-all command for ${cappedJobs.length} matched jobs`)

          void runWithConcurrency(cappedJobs, AUDIT_ALL_MAX_CONCURRENCY, async (job) => {
            await emitJobInsights(socket, job)
          }).catch((err) => {
            console.error(`Audit-all worker failed: ${String(err)}`)
          })
        }

        callback?.(response)
        if (IS_PRODUCTION) {
          console.log(`Search completed. results found: ${results.size}`)
        } else {
          console.log(`Search completed with query: ${payload.query}, results found: ${results.size}`, payload)
        }
        socket.emit('search:results', response)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Search failed: ${message}`)
        const errorResponse = {
          results: [],
          total: 0,
          meta: undefined,
          error: 'Search failed',
        }
        callback?.(errorResponse)
        socket.emit('search:results', errorResponse)
      }
    },
  )

  socket.on(
    'search:suggestions',
    (
      payload: { query?: string; limit?: number },
      callback?: (response: { suggestions: string[]; error?: string }) => void,
    ) => {
      if (!consumeLeakyBucket(socket.id, 'search:suggestions')) {
        emitRateLimitError(socket, 'search:suggestions')
        callbackRateLimitError(callback, {
          suggestions: [],
          error: 'Rate limit exceeded for search suggestions',
        })
        return
      }

      const query = String(payload?.query ?? '').trim()
      const limit = Math.max(1, Math.min(15, Number(payload?.limit ?? 8)))

      if (query.length < 2) {
        callback?.({ suggestions: [] })
        return
      }

      try {
        const suggestions = getSearchSuggestions(query, limit)
        callback?.({ suggestions })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Search suggestion failed for "${query}": ${message}`)
        callback?.({ suggestions: [], error: 'Failed to load suggestions' })
      }
    },
  )

  socket.on(
    'locations:search',
    async (
      payload: { query?: string },
      callback?: (response: { options: LocationOption[]; error?: string }) => void,
    ) => {
      if (!consumeLeakyBucket(socket.id, 'locations:search')) {
        emitRateLimitError(socket, 'locations:search')
        callbackRateLimitError(callback, {
          options: [],
          error: 'Rate limit exceeded for location search',
        })
        return
      }

      const query = (payload?.query || '').trim()

      if (query.length < 2) {
        callback?.({ options: [] })
        return
      }

      try {
        const options = await searchLocationsOpenStreetMap(query)
        callback?.({ options })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Location search failed for "${query}": ${message}`)
        callback?.({ options: [], error: 'Failed to search locations' })
      }
    },
  )

  socket.on('disconnect', () => {
    clearSocketRateLimitState(socket.id)
    console.log(`Socket disconnected: ${socket.id}`)
  })

  socket.on(
    'job:audit',
    (
      payload: { source_url?: string; name?: string; company_name?: string },
      callback?: (response: AuditResult & { error?: string }) => void,
    ) => {
      if (!consumeLeakyBucket(socket.id, 'job:audit')) {
        emitRateLimitError(socket, 'job:audit')
        callbackRateLimitError(callback, {
          auditScore: 0,
          auditText: '',
          error: 'Rate limit exceeded for job audit',
        })
        return
      }

      if (!IS_PRODUCTION) {
        console.log('Received audit request for job:', payload)
      }
      
      const job = payload.source_url
        ? JOBS.find((j) => j.source_url === payload.source_url)
        : JOBS.find((j) => j.name === payload.name && j.company_name === payload.company_name)

      if (!job) {
        console.warn('Job not found for audit:', payload)
        const notFound = { auditScore: 0, auditText: '', error: 'Job not found' }
        callback?.(notFound)
        return
      }

      void (async () => {
        try {
          const auditResult = await auditJobAsync(job, true)
          callback?.(auditResult)
          socket.emit('job:audit:result', { source_url: job.source_url, ...auditResult })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          callback?.({ auditScore: 0, auditText: '', error: `Job audit failed: ${message}` })
          console.error(`Audit failed for ${job.source_url}: ${message}`)
        }

        try {
          const qolResult = await qualityOfLifeJobAsync(job, true)
          socket.emit('job:qualityOfLife:result', { source_url: job.source_url, ...qolResult })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`Quality-of-life scoring failed for ${job.source_url}: ${message}`)
        }

        try {
          const impactResult: ImpactAIResult = await impactJobAIAsync(job, true)
          socket.emit('job:impact:result', {
            source_url: job.source_url,
            ai_impact_score: impactResult.impactScore,
            ai_impact_summary: impactResult.impactSummary,
            impactScore: impactResult.impactScore,
            impactSummary: impactResult.impactSummary,
            error: impactResult.error,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`Impact scoring failed for ${job.source_url}: ${message}`)
        }
      })()
    },
  )

  
})

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

function bytesToMb(value: number): string {
  return (value / (1024 * 1024)).toFixed(1)
}

function summarizeJobsBySource(jobs: ScrapedJob[]): { totalJobs: number; sourceSummary: string } {
  const counts = new Map<string, number>()

  for (const job of jobs) {
    const source = String(job.source ?? 'Unknown').trim() || 'Unknown'
    counts.set(source, (counts.get(source) ?? 0) + 1)
  }

  const sourceSummary = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source}=${count}`)
    .join(', ')

  return {
    totalJobs: jobs.length,
    sourceSummary,
  }
}

const memoryHeartbeat = setInterval(() => {
  const usage = process.memoryUsage()
  const jobSummary = summarizeJobsBySource(JOBS)
  // console.log(
  //   `[Heartbeat] memory rss=${bytesToMb(usage.rss)}MB heapUsed=${bytesToMb(usage.heapUsed)}MB heapTotal=${bytesToMb(usage.heapTotal)}MB external=${bytesToMb(usage.external)}MB arrayBuffers=${bytesToMb(usage.arrayBuffers)}MB totalJobs=${jobSummary.totalJobs} sources={${jobSummary.sourceSummary}}`,
  // )
}, MEMORY_HEARTBEAT_MS)
memoryHeartbeat.unref()

let shuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  console.log(`Received ${signal}. Starting graceful shutdown...`)
  clearInterval(memoryHeartbeat)

  const timeout = setTimeout(() => {
    console.error(`Forced shutdown after ${SHUTDOWN_TIMEOUT_MS}ms timeout.`)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  timeout.unref()

  try {
    await new Promise<void>((resolve) => io.close(() => resolve()))
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
    console.log('Graceful shutdown complete.')
    process.exit(0)
  } catch (error) {
    console.error('Shutdown failed:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT')
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  void gracefulShutdown('uncaughtException')
})
