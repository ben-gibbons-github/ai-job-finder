import { AsyncLocalStorage } from 'node:async_hooks'

import type { ScrapedJob } from './ScrapedJob.js'

type JobLoadOrigin = 'cache' | 'source'

interface JobLoadMeta {
  componentName: string
  loadOrigin: JobLoadOrigin
}

interface SourceCount {
  label: string
  count: number
  pct: number
}

interface ScraperUrlTraversalSummary {
  plannedUrlCount: number | null
  actualUrlCount: number
  stopReason: string
}

interface ScraperRunSummary {
  newJobs: number
  newPages: number
  cachedPages: number
  alreadyInDatabase: number
  rateLimited: boolean
  stopReason?: string
  cacheAgeMs?: number
  cacheRefreshInMs?: number
}

interface ScraperUrlTraversalDebugStat {
  label: string
  plannedUrlCount: number | null
  actualUrlCount: number
  actualVsPlannedPct: number | null
  stopReason: string
}

export interface ScraperPageJobCount {
  label: string
  query: string
  page: number
  jobsFound: number
  sourceUrls?: string[]
  httpCache?: 'hit' | 'miss'
}

export interface ScrapeLoadDebugStats {
  jobsFromCacheCount: number
  jobsFromCachePct: number
  jobsFromSourceCount: number
  jobsFromSourcePct: number
  cacheSources: SourceCount[]
  sourceSources: SourceCount[]
  urlCache: {
    totalLookups: number
    hits: number
    hitPct: number
    misses: number
    missPct: number
    hitSources: SourceCount[]
    missSources: SourceCount[]
  }
  scraperUrlTraversal: ScraperUrlTraversalDebugStat[]
  pageJobCounts: ScraperPageJobCount[]
  scraperSummaries?: ScraperRunSummaryDebugStat[]
}

export interface ScraperRunSummaryDebugStat {
  label: string
  stopReason: string
  rateLimited: boolean
  newJobs: number
  newPages: number
  cachedPages: number
  alreadyInDatabase: number
  cacheAgeMs?: number
  cacheRefreshInMs?: number
}

const scraperSourceContext = new AsyncLocalStorage<string>()

let jobLoadMetaByJob = new WeakMap<ScrapedJob, JobLoadMeta>()
const urlCacheHitsBySource = new Map<string, number>()
const urlCacheMissesBySource = new Map<string, number>()
const scraperUrlTraversalBySource = new Map<string, ScraperUrlTraversalSummary>()
let pageJobCounts: ScraperPageJobCount[] = []
const scraperRunSummaries = new Map<string, ScraperRunSummary>()
const databaseSourceUrlsBySource = new Map<string, Set<string>>()
const databaseJobCountBySource = new Map<string, number>()
const scrapedSourceUrlsBySource = new Map<string, Set<string>>()

function normalizeLabel(label: string | undefined | null): string {
  return String(label ?? '').trim() || 'Unknown'
}

function incrementCounter(counter: Map<string, number>, label: string): void {
  counter.set(label, (counter.get(label) ?? 0) + 1)
}

function toPct(count: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Number(((count / total) * 100).toFixed(1))
}

function buildSourceBreakdown(counter: Map<string, number>, total: number): SourceCount[] {
  return Array.from(counter.entries())
    .map(([label, count]) => ({
      label,
      count,
      pct: toPct(count, total),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

export function resetScrapeDebugTelemetry(): void {
  jobLoadMetaByJob = new WeakMap<ScrapedJob, JobLoadMeta>()
  urlCacheHitsBySource.clear()
  urlCacheMissesBySource.clear()
  scraperUrlTraversalBySource.clear()
  pageJobCounts = []
  databaseSourceUrlsBySource.clear()
  databaseJobCountBySource.clear()
  scrapedSourceUrlsBySource.clear()
  scraperRunSummaries.clear()
}

export function setScraperDatabaseSourceUrls(sourceName: string, sourceUrls: string[], databaseJobCount = sourceUrls.length): void {
  const label = normalizeLabel(sourceName)
  databaseSourceUrlsBySource.set(
    label,
    new Set(sourceUrls.map((url) => String(url ?? '').trim()).filter(Boolean)),
  )
  databaseJobCountBySource.set(label, Math.max(0, Math.round(databaseJobCount)))
}

export function recordPageJobCount(entry: {
  sourceName: string
  query?: string | null
  page: number
  jobsFound: number
  sourceUrls?: string[]
  httpCache?: 'hit' | 'miss'
}): void {
  const page = Number(entry.page)
  const jobsFound = Number(entry.jobsFound)

  const label = normalizeLabel(entry.sourceName)
  const query = String(entry.query ?? '').trim()
  const normalizedPage = Number.isFinite(page) ? Math.round(page) : 0
  const normalizedJobsFound = Number.isFinite(jobsFound) && jobsFound > 0 ? Math.round(jobsFound) : 0
  const cachedSourceUrls = databaseSourceUrlsBySource.get(label) ?? new Set<string>()
  const scrapedSourceUrls = scrapedSourceUrlsBySource.get(label) ?? new Set<string>()
  const sourceUrls = entry.sourceUrls ?? []
  const alreadyInDatabase = sourceUrls.filter((url) => cachedSourceUrls.has(url)).length
  const alreadyFetchedThisRun = sourceUrls.filter((url) => scrapedSourceUrls.has(url)).length
  const newJobs = Math.max(0, sourceUrls.length - alreadyInDatabase - alreadyFetchedThisRun)
  const summary = scraperRunSummaries.get(label) ?? {
    newJobs: 0,
    newPages: 0,
    cachedPages: 0,
    alreadyInDatabase: 0,
    rateLimited: false,
  }
  summary.newJobs += newJobs
  summary.alreadyInDatabase += alreadyInDatabase
  scraperRunSummaries.set(label, summary)
  for (const url of sourceUrls) scrapedSourceUrls.add(url)
  scrapedSourceUrlsBySource.set(label, scrapedSourceUrls)

  pageJobCounts.push({
    label,
    query,
    page: normalizedPage,
    jobsFound: normalizedJobsFound,
    sourceUrls: entry.sourceUrls?.map((url) => String(url ?? '').trim()).filter(Boolean),
    httpCache: entry.httpCache,
  })

  const logPageCounts = process.env.LOG_SCRAPED_PAGE_COUNTS === '1'
    || process.env.LOG_SCRAPED_PAGE_COUNTS === 'true'
  if (logPageCounts) {
    const databaseJobCount = databaseJobCountBySource.get(label) ?? 0
    const projectedDatabaseJobs = databaseJobCount + Array.from(scrapedSourceUrls)
      .filter((url) => !cachedSourceUrls.has(url)).length
    console.log(`[ScrapedPage] source=${label} page=${normalizedPage} fetched=${normalizedJobsFound} databaseJobs=${projectedDatabaseJobs} databaseJobsBeforeScrape=${databaseJobCount} new=${newJobs} alreadyInDatabase=${alreadyInDatabase} alreadyFetchedThisRun=${alreadyFetchedThisRun}${entry.httpCache ? ` httpCache=${entry.httpCache}` : ''} url=${JSON.stringify(query)}`)
  }
}

export function runWithScraperSource<T>(componentName: string, callback: () => Promise<T>): Promise<T> {
  return scraperSourceContext.run(normalizeLabel(componentName), callback)
}

export function getCurrentScraperSource(): string {
  return normalizeLabel(scraperSourceContext.getStore())
}

export function recordUrlCacheHit(componentName?: string | null): void {
  const label = normalizeLabel(componentName)
  incrementCounter(urlCacheHitsBySource, label)
  const summary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
  summary.cachedPages += 1
  scraperRunSummaries.set(label, summary)
}

export function recordUrlCacheMiss(componentName?: string | null): void {
  const label = normalizeLabel(componentName)
  incrementCounter(urlCacheMissesBySource, label)
  const summary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
  summary.newPages += 1
  scraperRunSummaries.set(label, summary)
}

export function recordScraperRateLimit(sourceName?: string | null): void {
  const label = normalizeLabel(sourceName)
  const summary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
  summary.rateLimited = true
  summary.stopReason = 'rate-limited'
  scraperRunSummaries.set(label, summary)
}

export function recordScraperNewJobs(sourceName: string, count: number): void {
  const label = normalizeLabel(sourceName)
  const summary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
  summary.newJobs = Math.max(summary.newJobs, Math.max(0, Math.round(Number(count) || 0)))
  scraperRunSummaries.set(label, summary)
}

export function recordFreshCacheAge(sourceName: string, ageMs: number, refreshInMs: number): void {
  const label = normalizeLabel(sourceName)
  const summary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
  summary.cacheAgeMs = Math.max(0, Math.round(ageMs))
  summary.cacheRefreshInMs = Math.max(0, Math.round(refreshInMs))
  scraperRunSummaries.set(label, summary)
}

export function recordScraperCompletion(sourceName: string, stopReason = 'completed'): void {
  const label = normalizeLabel(sourceName)
  const summary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
  if (!summary.stopReason) summary.stopReason = stopReason
  scraperRunSummaries.set(label, summary)
}

export function tagJobsWithLoadOrigin(jobs: ScrapedJob[], componentName: string, loadOrigin: JobLoadOrigin): void {
  const label = normalizeLabel(componentName)
  for (const job of jobs) {
    jobLoadMetaByJob.set(job, { componentName: label, loadOrigin })
  }
}

export function recordScraperUrlTraversal(summary: {
  sourceName: string
  plannedUrlCount?: number | null
  actualUrlCount: number
  stopReason: string
}): void {
  const label = normalizeLabel(summary.sourceName)
  const plannedRaw = Number(summary.plannedUrlCount)
  const plannedUrlCount = Number.isFinite(plannedRaw) && plannedRaw > 0
    ? Math.round(plannedRaw)
    : null
  const actualRaw = Number(summary.actualUrlCount)
  const actualUrlCount = Number.isFinite(actualRaw) && actualRaw >= 0
    ? Math.round(actualRaw)
    : 0
  const stopReason = String(summary.stopReason ?? '').trim() || 'unknown'

  scraperUrlTraversalBySource.set(label, {
    plannedUrlCount,
    actualUrlCount,
    stopReason,
  })
  const runSummary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
  runSummary.stopReason = stopReason
  scraperRunSummaries.set(label, runSummary)
}

export function buildScrapeLoadDebugStats(jobs: ScrapedJob[]): ScrapeLoadDebugStats {
  let jobsFromCacheCount = 0
  let jobsFromSourceCount = 0
  const cacheSources = new Map<string, number>()
  const sourceSources = new Map<string, number>()

  for (const job of jobs) {
    const meta = jobLoadMetaByJob.get(job)
    const componentName = normalizeLabel(meta?.componentName || job.source)
    const loadOrigin: JobLoadOrigin = meta?.loadOrigin ?? 'source'

    if (loadOrigin === 'cache') {
      jobsFromCacheCount += 1
      incrementCounter(cacheSources, componentName)
    } else {
      jobsFromSourceCount += 1
      incrementCounter(sourceSources, componentName)
    }
  }

  const totalJobs = jobs.length
  const urlCacheHits = Array.from(urlCacheHitsBySource.values()).reduce((sum, count) => sum + count, 0)
  const urlCacheMisses = Array.from(urlCacheMissesBySource.values()).reduce((sum, count) => sum + count, 0)
  const totalLookups = urlCacheHits + urlCacheMisses
  const urlLookupsBySource = new Map<string, number>()

  for (const [label, count] of urlCacheHitsBySource.entries()) {
    urlLookupsBySource.set(label, (urlLookupsBySource.get(label) ?? 0) + count)
  }
  for (const [label, count] of urlCacheMissesBySource.entries()) {
    urlLookupsBySource.set(label, (urlLookupsBySource.get(label) ?? 0) + count)
  }

  const traversalSources = new Set<string>([
    ...Array.from(urlLookupsBySource.keys()),
    ...Array.from(scraperUrlTraversalBySource.keys()),
  ])

  const scraperUrlTraversal = Array.from(traversalSources)
    .map((label) => {
      const recorded = scraperUrlTraversalBySource.get(label)
      const urlLookupCount = urlLookupsBySource.get(label) ?? 0
      const actualUrlCount = Math.max(Number(recorded?.actualUrlCount ?? 0), urlLookupCount)
      const plannedUrlCount = recorded?.plannedUrlCount ?? null
      const actualVsPlannedPct = plannedUrlCount && plannedUrlCount > 0
        ? toPct(actualUrlCount, plannedUrlCount)
        : null
      const stopReason = recorded?.stopReason
        ?? (urlLookupCount > 0 ? 'unknown-custom-loop' : 'no-url-fetches')

      return {
        label,
        plannedUrlCount,
        actualUrlCount,
        actualVsPlannedPct,
        stopReason,
      }
    })
    .sort((left, right) => right.actualUrlCount - left.actualUrlCount || left.label.localeCompare(right.label))

  return {
    jobsFromCacheCount,
    jobsFromCachePct: toPct(jobsFromCacheCount, totalJobs),
    jobsFromSourceCount,
    jobsFromSourcePct: toPct(jobsFromSourceCount, totalJobs),
    cacheSources: buildSourceBreakdown(cacheSources, totalJobs),
    sourceSources: buildSourceBreakdown(sourceSources, totalJobs),
    urlCache: {
      totalLookups,
      hits: urlCacheHits,
      hitPct: toPct(urlCacheHits, totalLookups),
      misses: urlCacheMisses,
      missPct: toPct(urlCacheMisses, totalLookups),
      hitSources: buildSourceBreakdown(urlCacheHitsBySource, urlCacheHits),
      missSources: buildSourceBreakdown(urlCacheMissesBySource, urlCacheMisses),
    },
    scraperUrlTraversal,
    pageJobCounts: pageJobCounts.map((entry) => ({ ...entry })),
    scraperSummaries: Array.from(new Set([
      ...Array.from(scraperRunSummaries.keys()),
      ...Array.from(scraperUrlTraversalBySource.keys()),
    ])).map((label) => {
      const summary = scraperRunSummaries.get(label) ?? { newJobs: 0, newPages: 0, cachedPages: 0, alreadyInDatabase: 0, rateLimited: false }
      return {
        label,
        stopReason: summary.stopReason ?? scraperUrlTraversalBySource.get(label)?.stopReason ?? 'unknown',
        rateLimited: summary.rateLimited,
        newJobs: summary.newJobs,
        newPages: summary.newPages,
        cachedPages: summary.cachedPages,
        alreadyInDatabase: summary.alreadyInDatabase,
        cacheAgeMs: summary.cacheAgeMs,
        cacheRefreshInMs: summary.cacheRefreshInMs,
      }
    }).sort((left, right) => right.newJobs - left.newJobs || left.label.localeCompare(right.label)),
  }
}