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

interface ScraperUrlTraversalDebugStat {
  label: string
  plannedUrlCount: number | null
  actualUrlCount: number
  actualVsPlannedPct: number | null
  stopReason: string
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
}

const scraperSourceContext = new AsyncLocalStorage<string>()

let jobLoadMetaByJob = new WeakMap<ScrapedJob, JobLoadMeta>()
const urlCacheHitsBySource = new Map<string, number>()
const urlCacheMissesBySource = new Map<string, number>()
const scraperUrlTraversalBySource = new Map<string, ScraperUrlTraversalSummary>()

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
}

export function runWithScraperSource<T>(componentName: string, callback: () => Promise<T>): Promise<T> {
  return scraperSourceContext.run(normalizeLabel(componentName), callback)
}

export function getCurrentScraperSource(): string {
  return normalizeLabel(scraperSourceContext.getStore())
}

export function recordUrlCacheHit(componentName?: string | null): void {
  incrementCounter(urlCacheHitsBySource, normalizeLabel(componentName))
}

export function recordUrlCacheMiss(componentName?: string | null): void {
  incrementCounter(urlCacheMissesBySource, normalizeLabel(componentName))
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
  }
}