import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import type { ScrapeLoadDebugStats } from '../scraping/core/ScrapeDebugTelemetry.js'
import { getJobDebugFlag } from '../searching/searchMain/SearchMain.js'
import type { CacheDatabaseSchemaOutline } from '../database/CacheDatabase.js'
import { getCacheDatabaseSchemaOutline } from '../database/CacheDatabase.js'
import type { CacheIoDebugSummary } from '../utils/CacheIoTelemetry.js'
import { getCacheIoDebugSummary } from '../utils/CacheIoTelemetry.js'

export interface ServerDebugCoverageStats {
  withAuditScoreCount: number
  withAuditScorePct: number
  withImpactScoreCount: number
  withImpactScorePct: number
  withQolScoreCount: number
  withQolScorePct: number
  missingDescriptionCount: number
  missingDescriptionPct: number
  missingDescriptionSources: Array<{
    label: string
    count: number
    pct: number
  }>
  geocodedCount: number
  geocodedPct: number
  scrapeLoad: ScrapeLoadDebugStats
  sourceBreakdown: Array<{
    label: string
    count: number
    pct: number
  }>
  debugStatuses: Array<{
    label: string
    count: number
    pct: number
  }>
  aiOverall: {
    companyReviewsCount: number
    summaryLength: {
      overallAvgChars: number
      overallAvgWords: number
      auditAvgChars: number
      auditAvgWords: number
      impactAvgChars: number
      impactAvgWords: number
      qolAvgChars: number
      qolAvgWords: number
    }
    scores: {
      audit: ServerScoreAggregate
      impact: ServerScoreAggregate
      qol: ServerScoreAggregate
    }
  }
  employerConcentration: {
    totalEmployers: number
    totalJobs: number
    curvePoints: Array<{
      employerPct: number
      employerCount: number
      jobsPct: number
      jobCount: number
    }>
    topEmployers: Array<{
      rank: number
      companyName: string
      jobCount: number
      jobPct: number
      cumulativeJobsPct: number
    }>
  }
  cacheIo: CacheIoDebugSummary
  cacheDatabaseSchema: CacheDatabaseSchemaOutline
}

export interface ServerJobCorpusSummary {
  totalJobs: number
  totalEmployers: number
  totalSources: number
}

export function summarizeJobCorpus(jobs: ScrapedJob[]): ServerJobCorpusSummary {
  const employers = new Set<string>()
  const sources = new Set<string>()

  for (const job of jobs) {
    const employer = String(job.company_name ?? '').trim().toLowerCase()
    const source = String(job.source ?? '').trim().toLowerCase()
    if (employer) employers.add(employer)
    if (source) sources.add(source)
  }

  return {
    totalJobs: jobs.length,
    totalEmployers: employers.size,
    totalSources: sources.size,
  }
}

export interface ServerScoreDistributionBucket {
  label: string
  start: number
  end: number
  count: number
  pct: number
}

export interface ServerScoreAggregate {
  avg: number
  distribution: ServerScoreDistributionBucket[]
}

function normalizeCompanyName(name: string): string {
  return String(name ?? '').trim().toLowerCase()
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function countWords(text: string): number {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

export function summarizeScore(values: number[]): ServerScoreAggregate {
  const buckets: Array<{ label: string; start: number; end: number }> = [
    { label: '0-19', start: 0, end: 19 },
    { label: '20-39', start: 20, end: 39 },
    { label: '40-59', start: 40, end: 59 },
    { label: '60-79', start: 60, end: 79 },
    { label: '80-100', start: 80, end: 100 },
  ]
  const total = Math.max(1, values.length)

  const distribution = buckets.map((bucket) => {
    const count = values.filter((value) => value >= bucket.start && value <= bucket.end).length
    return {
      ...bucket,
      count,
      pct: Number(((count / total) * 100).toFixed(1)),
    }
  })

  const avg = values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
    : 0

  return { avg, distribution }
}

function isGeocoded(job: ScrapedJob): boolean {
  return Number.isFinite(job.location_lat)
    && Number.isFinite(job.location_lon)
    && !(job.location_lat === 0 && job.location_lon === 0)
}

function hasAuditScore(job: ScrapedJob): boolean {
  const employer = job.scrapedEmployer
  return Number(employer?.ai_score ?? 0) > 0
    || Number(employer?.ai_red_flag_score ?? 0) > 0
    || String(employer?.ai_summary ?? '').trim().length > 0
    || String(employer?.ai_red_flag_summary ?? '').trim().length > 0
    || Number(job.audit_number ?? 0) > 0
    || String(job.audit_text ?? '').trim().length > 0
}

function hasImpactScore(job: ScrapedJob): boolean {
  const employer = job.scrapedEmployer
  return Number(employer?.ai_impact_score ?? 0) > 0
    || String(employer?.ai_impact_summary ?? '').trim().length > 0
    || Number(job.impact_number ?? 0) > 0
}

function hasQolScore(job: ScrapedJob): boolean {
  const employer = job.scrapedEmployer
  return Number(employer?.employeeQualityOfLifeScore ?? 0) > 0
    || String(employer?.employeeQualityOfLifeSummary ?? '').trim().length > 0
}

function hasDescription(job: ScrapedJob): boolean {
  return String(job.description ?? '').trim().length > 0
}

function computeAiOverallStats(jobs: ScrapedJob[]): ServerDebugCoverageStats['aiOverall'] {
  const employerByCompany = new Map<string, NonNullable<ScrapedJob['scrapedEmployer']>>()

  for (const job of jobs) {
    const employer = job.scrapedEmployer
    if (!employer) continue
    const key = normalizeCompanyName(employer.name || job.company_name)
    if (!key || employerByCompany.has(key)) continue
    employerByCompany.set(key, employer)
  }

  const employers = Array.from(employerByCompany.values())
  const employersWithAnyAiData = employers.filter((employer) => (
    String(employer.ai_summary ?? '').trim().length > 0
    || String(employer.ai_impact_summary ?? '').trim().length > 0
    || String(employer.employeeQualityOfLifeSummary ?? '').trim().length > 0
    || Number(employer.ai_score ?? 0) > 0
    || Number(employer.ai_impact_score ?? 0) > 0
    || Number(employer.employeeQualityOfLifeScore ?? 0) > 0
  ))

  const auditSummaryLens = employersWithAnyAiData
    .map((employer) => String(employer.ai_summary ?? '').trim())
  const impactSummaryTexts = employersWithAnyAiData
    .map((employer) => String(employer.ai_impact_summary ?? '').trim())
  const qolSummaryTexts = employersWithAnyAiData
    .map((employer) => String(employer.employeeQualityOfLifeSummary ?? '').trim())

  const auditSummaryCharLens = auditSummaryLens
    .map((text) => text.length)
    .filter((length) => length > 0)
  const impactSummaryCharLens = impactSummaryTexts
    .map((text) => text.length)
    .filter((length) => length > 0)
  const qolSummaryCharLens = qolSummaryTexts
    .map((text) => text.length)
    .filter((length) => length > 0)

  const auditSummaryWordLens = auditSummaryLens
    .map((text) => countWords(text))
    .filter((count) => count > 0)
  const impactSummaryWordLens = impactSummaryTexts
    .map((text) => countWords(text))
    .filter((count) => count > 0)
  const qolSummaryWordLens = qolSummaryTexts
    .map((text) => countWords(text))
    .filter((count) => count > 0)

  const combinedSummaryLens = [
    ...auditSummaryCharLens,
    ...impactSummaryCharLens,
    ...qolSummaryCharLens,
  ]
  const combinedSummaryWordLens = [
    ...auditSummaryWordLens,
    ...impactSummaryWordLens,
    ...qolSummaryWordLens,
  ]

  const average = (values: number[]): number => {
    if (!values.length) return 0
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
  }

  const auditScores = employersWithAnyAiData
    .filter((employer) => Number(employer.ai_score ?? 0) > 0 || String(employer.ai_summary ?? '').trim().length > 0)
    .map((employer) => clampScore(Number(employer.ai_score ?? 0)))
  const impactScores = employersWithAnyAiData
    .filter((employer) => Number(employer.ai_impact_score ?? 0) > 0 || String(employer.ai_impact_summary ?? '').trim().length > 0)
    .map((employer) => clampScore(Number(employer.ai_impact_score ?? 0)))
  const qolScores = employersWithAnyAiData
    .filter((employer) => Number(employer.employeeQualityOfLifeScore ?? 0) > 0 || String(employer.employeeQualityOfLifeSummary ?? '').trim().length > 0)
    .map((employer) => clampScore(Number(employer.employeeQualityOfLifeScore ?? 0)))

  return {
    companyReviewsCount: employersWithAnyAiData.length,
    summaryLength: {
      overallAvgChars: average(combinedSummaryLens),
      overallAvgWords: average(combinedSummaryWordLens),
      auditAvgChars: average(auditSummaryCharLens),
      auditAvgWords: average(auditSummaryWordLens),
      impactAvgChars: average(impactSummaryCharLens),
      impactAvgWords: average(impactSummaryWordLens),
      qolAvgChars: average(qolSummaryCharLens),
      qolAvgWords: average(qolSummaryWordLens),
    },
    scores: {
      audit: summarizeScore(auditScores),
      impact: summarizeScore(impactScores),
      qol: summarizeScore(qolScores),
    },
  }
}

function computeEmployerConcentrationStats(jobs: ScrapedJob[]): ServerDebugCoverageStats['employerConcentration'] {
  const countsByEmployer = new Map<string, { companyName: string; count: number }>()

  for (const job of jobs) {
    const rawCompanyName = String(job.company_name ?? '').trim() || 'Unknown employer'
    const key = normalizeCompanyName(rawCompanyName)
    const current = countsByEmployer.get(key)
    if (current) {
      current.count += 1
    } else {
      countsByEmployer.set(key, { companyName: rawCompanyName, count: 1 })
    }
  }

  const sortedEmployers = Array.from(countsByEmployer.values())
    .sort((left, right) => right.count - left.count || left.companyName.localeCompare(right.companyName))

  const totalEmployers = sortedEmployers.length
  const totalJobs = jobs.length
  const safeTotalJobs = Math.max(1, totalJobs)

  let runningJobs = 0
  const topEmployers = sortedEmployers
    .slice(0, 500)
    .map((entry, index) => {
      runningJobs += entry.count
      return {
        rank: index + 1,
        companyName: entry.companyName,
        jobCount: entry.count,
        jobPct: Number(((entry.count / safeTotalJobs) * 100).toFixed(2)),
        cumulativeJobsPct: Number(((runningJobs / safeTotalJobs) * 100).toFixed(2)),
      }
    })

  const checkpoints = [0, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const curvePoints: ServerDebugCoverageStats['employerConcentration']['curvePoints'] = []
  let checkpointIndex = 0
  let cumulativeJobs = 0

  for (let i = 0; i < sortedEmployers.length; i += 1) {
    cumulativeJobs += sortedEmployers[i].count
    const employerCount = i + 1
    const employerPct = Number(((employerCount / Math.max(1, totalEmployers)) * 100).toFixed(2))

    while (checkpointIndex < checkpoints.length && employerPct >= checkpoints[checkpointIndex]) {
      const checkpoint = checkpoints[checkpointIndex]
      curvePoints.push({
        employerPct: checkpoint,
        employerCount,
        jobsPct: Number(((cumulativeJobs / safeTotalJobs) * 100).toFixed(2)),
        jobCount: cumulativeJobs,
      })
      checkpointIndex += 1
    }
  }

  while (checkpointIndex < checkpoints.length) {
    const checkpoint = checkpoints[checkpointIndex]
    curvePoints.push({
      employerPct: checkpoint,
      employerCount: totalEmployers,
      jobsPct: totalJobs > 0 ? 100 : 0,
      jobCount: totalJobs,
    })
    checkpointIndex += 1
  }

  return {
    totalEmployers,
    totalJobs,
    curvePoints,
    topEmployers,
  }
}

export function computeServerDebugCoverageStats(jobs: ScrapedJob[], scrapeLoad: ScrapeLoadDebugStats): ServerDebugCoverageStats {
  const total = Math.max(1, jobs.length)

  let withAuditScoreCount = 0
  let withImpactScoreCount = 0
  let withQolScoreCount = 0
  let missingDescriptionCount = 0
  let geocodedCount = 0
  const sourceCounts = new Map<string, number>()
  const missingDescriptionSourceCounts = new Map<string, number>()
  const debugStatusCounts = new Map<string, number>()

  for (const job of jobs) {
    if (hasAuditScore(job)) withAuditScoreCount += 1
    if (hasImpactScore(job)) withImpactScoreCount += 1
    if (hasQolScore(job)) withQolScoreCount += 1
    if (!hasDescription(job)) {
      missingDescriptionCount += 1
      const sourceLabel = String(job.source ?? '').trim() || 'Unknown'
      missingDescriptionSourceCounts.set(sourceLabel, (missingDescriptionSourceCounts.get(sourceLabel) ?? 0) + 1)
    }
    if (isGeocoded(job)) geocodedCount += 1

    const sourceLabel = String(job.source ?? '').trim() || 'Unknown'
    sourceCounts.set(sourceLabel, (sourceCounts.get(sourceLabel) ?? 0) + 1)

    const debugFlag = getJobDebugFlag(job)
    if (debugFlag) {
      debugStatusCounts.set(debugFlag, (debugStatusCounts.get(debugFlag) ?? 0) + 1)
    }
  }

  const pct = (count: number) => Number(((count / total) * 100).toFixed(1))
  const sourceBreakdown = Array.from(sourceCounts.entries())
    .map(([label, count]) => ({ label, count, pct: pct(count) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  const missingDescriptionSources = Array.from(missingDescriptionSourceCounts.entries())
    .map(([label, count]) => ({ label, count, pct: pct(count) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  const debugStatuses = Array.from(debugStatusCounts.entries())
    .map(([label, count]) => ({ label, count, pct: pct(count) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))

  return {
    withAuditScoreCount,
    withAuditScorePct: pct(withAuditScoreCount),
    withImpactScoreCount,
    withImpactScorePct: pct(withImpactScoreCount),
    withQolScoreCount,
    withQolScorePct: pct(withQolScoreCount),
    missingDescriptionCount,
    missingDescriptionPct: pct(missingDescriptionCount),
    missingDescriptionSources,
    geocodedCount,
    geocodedPct: pct(geocodedCount),
    scrapeLoad,
    sourceBreakdown,
    debugStatuses,
    aiOverall: computeAiOverallStats(jobs),
    employerConcentration: computeEmployerConcentrationStats(jobs),
    cacheIo: getCacheIoDebugSummary(),
    cacheDatabaseSchema: getCacheDatabaseSchemaOutline(),
  }
}

export function withLiveCacheIoSummary(stats: ServerDebugCoverageStats): ServerDebugCoverageStats {
  return {
    ...stats,
    cacheIo: getCacheIoDebugSummary(),
    cacheDatabaseSchema: getCacheDatabaseSchemaOutline(),
  }
}
