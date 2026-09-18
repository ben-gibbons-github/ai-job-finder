import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import { clearActiveOperation, setActiveOperation } from './ServerActivityTracker.js'

export function summarizeJobsBySource(jobs: ScrapedJob[]): { totalJobs: number; sourceSummary: string } {
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

export function bytesToMb(value: number): string {
  return (value / (1024 * 1024)).toFixed(1)
}

export function startMemoryHeartbeat(
  jobsProvider: () => ScrapedJob[],
  heartbeatMs = 5000,
  enabled = true,
): NodeJS.Timeout | null {
  const startFromEnv = String(process.env.StartMemoryHeartbeat ?? '').toLowerCase() === 'true'
  if (!enabled || !startFromEnv) {
    return null
  }

  const heartbeat = setInterval(() => {
    const op = 'heartbeat:memory'
    const tickStartedAtMs = Date.now()
    setActiveOperation(op)
    try {
      const usage = process.memoryUsage()
      const jobSummary = summarizeJobsBySource(jobsProvider())
      const elapsedMs = Date.now() - tickStartedAtMs
      console.log(
        `[Heartbeat] tickMs=${elapsedMs} rssMB=${bytesToMb(usage.rss)} heapUsedMB=${bytesToMb(usage.heapUsed)} heapTotalMB=${bytesToMb(usage.heapTotal)} externalMB=${bytesToMb(usage.external)} arrayBuffersMB=${bytesToMb(usage.arrayBuffers)} totalJobs=${jobSummary.totalJobs} sources={${jobSummary.sourceSummary}}`,
      )
      void usage
      void jobSummary
    } finally {
      clearActiveOperation(op)
    }
  }, heartbeatMs)

  heartbeat.unref?.()
  return heartbeat
}
