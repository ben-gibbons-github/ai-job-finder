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
import { warmJobHaystachCache, getVocabSize, sortJobsByQuality } from './searching/SearchUtils.js'
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
const SEARCH_DEBUG_ENABLED = process.env.SEARCH_DEBUG_ENABLED === 'true'
const AUDIT_ENABLED = process.env.AUDIT_ENABLED === 'true'
const HAYSTACK_WARMUP_ENABLED = process.env.HAYSTACK_WARMUP_ENABLED === 'true'
const AUDIT_ALL_MAX_CONCURRENCY = Math.max(1, Number(process.env.AUDIT_ALL_MAX_CONCURRENCY ?? 4))
const AUDIT_ALL_MAX_JOBS = Math.max(1, Number(process.env.AUDIT_ALL_MAX_JOBS ?? 250))
const SHUTDOWN_TIMEOUT_MS = Math.max(1000, Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000))
const MEMORY_HEARTBEAT_MS = 5000

import {
  setActiveOperation,
  clearActiveOperation,
  getActiveOperation,
  getLastCompletedOp,
  getLastCompletedAt,
} from './utils/ServerActivityTracker.js'

// ─── Event loop lag monitor ─────────────────────────────────────────────────────
const EL_INTERVAL_MS = 100
const EL_WARN_THRESHOLD_MS = 150
let elLastTick = Date.now()
const eventLoopMonitor = setInterval(() => {
  const now = Date.now()
  const lag = now - elLastTick - EL_INTERVAL_MS
  if (lag > EL_WARN_THRESHOLD_MS) {
    const active = getActiveOperation()
    let blame: string
    if (active !== 'idle') {
      blame = `active: "${active}"`
    } else {
      const msSinceEnd = now - getLastCompletedAt()
      blame = `recently finished: "${getLastCompletedOp()}" (ended ~${msSinceEnd}ms ago)`
    }
    console.warn(`[EventLoop] ⚠️  Blocked for ~${lag + EL_INTERVAL_MS}ms — ${blame}`)
  }
  elLastTick = now
}, EL_INTERVAL_MS)
eventLoopMonitor.unref()

// ─── Timing helper ───────────────────────────────────────────────────────────
function startTimer(label: string): () => void {
  setActiveOperation(label)
  const t0 = performance.now()
  console.log(`[Timer] ▶ ${label}`)
  return () => {
    clearActiveOperation(label)
    const ms = (performance.now() - t0).toFixed(0)
    const icon = Number(ms) > 2000 ? '🔴' : Number(ms) > 500 ? '🟡' : '🟢'
    console.log(`[Timer] ${icon} ${label} → ${ms}ms`)
  }
}

// Global job list
let JOBS: ScrapedJob[] = []
const searchMain = new SearchMain()
const top100Search = new Top100Search(searchMain)

// ─── Tag cloud ───────────────────────────────────────────────────────────────

interface TagCloudEntry { word: string; count: number }
let cachedTagCloud: TagCloudEntry[] = []

const TAG_CLOUD_STOP_WORDS = new Set([
  'the','a','an','and','or','in','to','of','for','with','as','is','are','was',
  'were','be','been','being','you','your','our','we','us','their','they','it',
  'its','this','that','these','those','will','can','may','must','should',
  'would','could','have','has','had','do','does','did','not','no','by','at',
  'on','up','out','if','so','all','also','any','new','one','two','more','other',
  'work','working','job','role','position','team','company','opportunity',
  'years','experience','ability','skills','strong','including','related',
  'within','across','provide','ensure','support','manage','develop','build',
  'using','from','into','about','such','well','both','each','than','then',
  'when','where','which','who','how','what','their','them','through','over',
  'under','between','during','while','after','before','based','required',
  'looking','join','help','make','take','use','get','set','go','per','etc',
  // scraper fallback values
  'unknown','none','na',
  // html entity artifacts
  'nbsp','amp','quot','apos','lt','gt','ndash','mdash','lsquo','rsquo',
])

function buildTagCloud(jobs: ScrapedJob[], topN = 150): TagCloudEntry[] {
  const counts = new Map<string, number>()

  for (const job of jobs) {
    const rawText = `${job.name ?? ''} ${job.description ?? ''} ${job.type ?? ''}`
    // Strip HTML tags and decode/discard HTML entities before tokenizing
    const text = rawText
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#][a-z0-9]{0,6};/gi, ' ')
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)

    for (const token of tokens) {
      if (token.length < 3 || token.length > 24) continue
      if (TAG_CLOUD_STOP_WORDS.has(token)) continue
      if (/^\d+$/.test(token)) continue
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }))
}

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

    const doneSortQuality = startTimer(`sortJobsByQuality (${JOBS.length} jobs)`)
    sortJobsByQuality(JOBS)
    doneSortQuality()
    console.log(`[Startup] Jobs sorted by quality score.`)

    const doneSearchSuggestions = startTimer(`rebuildSearchSuggestions (${JOBS.length} jobs)`)
    rebuildSearchSuggestions(JOBS)
    doneSearchSuggestions()
    console.log(`Built search suggestion index with ${getSearchSuggestionCount()} unique terms.`)

    // Pre-warm the query haystack token cache in small async chunks so the
    // event loop stays free and the server stays responsive during warmup.
    if (HAYSTACK_WARMUP_ENABLED) {
      const warmupTotal = JOBS.length

      // ── Pre-scan: find the worst offenders before warmup begins ──────────────
      const PRE_SCAN_FIELD_WARN = 5_000   // bytes — flag fields larger than this
      const topLargeJobs: Array<{ idx: number; descLen: number; label: string }> = []
      for (let idx = 0; idx < JOBS.length; idx++) {
        const job = JOBS[idx]
        const descLen = String(job.description ?? '').length
        if (descLen > PRE_SCAN_FIELD_WARN) {
          topLargeJobs.push({ idx, descLen, label: `${String(job.company_name ?? '?')} | ${String(job.name ?? '?')}` })
        }
      }
      topLargeJobs.sort((a, b) => b.descLen - a.descLen)
      const topN = topLargeJobs.slice(0, 20)
      console.log(`[Haystack] Pre-scan: ${topLargeJobs.length} jobs with description > ${PRE_SCAN_FIELD_WARN} chars`)
      if (topN.length > 0) {
        console.log(`[Haystack] Top ${topN.length} largest descriptions:`)
        for (const { idx, descLen, label } of topN) {
          console.log(`  job[${idx}] ${descLen.toLocaleString()} chars — ${label}`)
        }
      }

    ;(async () => {
      const CHUNK = 10  // tiny chunks so event loop stays responsive during warmup
      const SLOW_CHUNK_MS = 50  // warn if a chunk takes longer than this
      const SLOW_JOB_MS = 5    // within a slow chunk, flag individual slow jobs
      const FIELD_WARN_LEN = 2_000  // report field lengths for slow jobs above this
      let i = 0
      const t0 = performance.now()
      while (i < JOBS.length) {
        const chunkLabel = `haystack-warmup chunk ${Math.floor(i / CHUNK)} (jobs ${i}–${Math.min(i + CHUNK - 1, warmupTotal - 1)})`
        setActiveOperation(chunkLabel)
        const chunkStart = performance.now()
        const chunk = JOBS.slice(i, i + CHUNK)

        for (const job of chunk) {
          const jobStart = performance.now()
          const descRaw = String(job.description ?? '')
          const nameRaw = String(job.name ?? '')
          const tagsRaw = (job.tags ?? []).join(' ')

          // Time each sub-step to pinpoint which operation blocks
          const t1 = performance.now()
          const _ = descRaw.length  // just access length — baseline
          const tCheck = performance.now() - t1

          warmJobHaystachCache([job])
          const jobMs = performance.now() - jobStart

          if (jobMs > SLOW_JOB_MS) {
            const fields = [
              `desc=${descRaw.length}`,
              `name=${nameRaw.length}`,
              `tags=${tagsRaw.length}`,
              `url=${String(job.source_url ?? '').length}`,
            ].join(' ')
            const cappedAt = descRaw.length > 800 ? ' [DESC_CAPPED]' : ''
            console.warn(
              `[Haystack] Slow job ${jobMs.toFixed(1)}ms — ` +
              `${String(job.company_name ?? '?')} | ${nameRaw.slice(0, 60)}${cappedAt}\n` +
              `  fields: ${fields}  source: ${String(job.source ?? '?')}`,
            )
          } else if (descRaw.length > FIELD_WARN_LEN) {
            console.log(
              `[Haystack] Large desc (${descRaw.length} chars) but fast (${jobMs.toFixed(1)}ms) — ` +
              `${String(job.company_name ?? '?')} | ${nameRaw.slice(0, 60)}  [cap working]`,
            )
          }
        }

        const chunkMs = performance.now() - chunkStart
        clearActiveOperation(chunkLabel)
        if (chunkMs > SLOW_CHUNK_MS) {
          console.warn(`[Haystack] Slow chunk ${Math.floor(i / CHUNK)} (jobs ${i}–${i + chunk.length - 1}): ${chunkMs.toFixed(0)}ms for ${chunk.length} jobs — avg ${(chunkMs / chunk.length).toFixed(1)}ms/job`)
        }
        i += CHUNK
        if (i % 25_000 === 0 || i >= JOBS.length) {
          const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
          const pct = Math.min(100, Math.round((i / warmupTotal) * 100))
          console.log(`[Haystack] Warmup ${pct}% — ${Math.min(i, warmupTotal).toLocaleString()}/${warmupTotal.toLocaleString()} jobs — ${elapsed}s elapsed`)
        }
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      console.log(`[Timer] 🟢 Haystack warmup → ${(performance.now() - t0).toFixed(0)}ms total | vocab: ${getVocabSize().toLocaleString()} unique tokens`)
    })().catch((err) => console.warn('[Startup] Haystack warmup failed:', err))
    } else {
      console.log('[Haystack] Warmup skipped (HAYSTACK_WARMUP_ENABLED not set) — cache will build lazily on first search.')
    }

    const doneTagCloud = startTimer(`buildTagCloud (${JOBS.length} jobs, top 500)`)
    cachedTagCloud = buildTagCloud(JOBS, 500)
    doneTagCloud()
    console.log(`Built tag cloud with ${cachedTagCloud.length} entries.`)

    const doneTop100 = startTimer('top100Search.refresh')
    const cached = await top100Search.refresh(JOBS)
    doneTop100()
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
  const label = `ai-job-processing: ${String(job.company_name ?? '?')} | ${String(job.name ?? '?')}`
  setActiveOperation(label)
  const [auditResult, qolResult, impactResult] = await Promise.allSettled([
    auditJobAsync(job, true),
    qualityOfLifeJobAsync(job, true),
    impactJobAIAsync(job, true),
  ])
  clearActiveOperation(label)

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
  socket.emit('server:config', { auditEnabled: AUDIT_ENABLED })

  if (cachedTagCloud.length > 0) {
    socket.emit('server:tagCloud', cachedTagCloud)
  }

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

      if (payload?.command === AI_AUDIT_ALL_COMMAND && !AUDIT_ENABLED) {
        callbackRateLimitError(callback, { results: [], total: 0, meta: undefined, error: 'Audit is disabled on this server' })
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
        const searchLabel = `search query="${String(payload?.query ?? '').slice(0, 40)}"`
        setActiveOperation(searchLabel)
        const results = await searchMain.search(JOBS, payload, SEARCH_DEBUG_ENABLED)
        clearActiveOperation(searchLabel)
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
          const fullResults = await searchMain.search(JOBS, fullSearchPayload, SEARCH_DEBUG_ENABLED)
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
          // console.log(`Search completed with query: ${payload.query}, results found: ${results.size}`, payload)
        }
        socket.emit('search:results', response)
        // Yield after emit so JSON serialization doesn't block the next request
        await new Promise<void>((resolve) => setImmediate(resolve))
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
      if (!AUDIT_ENABLED) {
        callbackRateLimitError(callback, { auditScore: 0, auditText: '', error: 'Audit is disabled on this server' })
        return
      }
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
