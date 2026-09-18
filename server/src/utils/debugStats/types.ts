import type { ScrapeLoadDebugStats } from '../../scraping/core/ScrapeDebugTelemetry.js'
import type { CacheDatabaseSchemaOutline } from '../../database/CacheDatabase.js'
import type { CacheIoDebugSummary } from '../CacheIoTelemetry.js'

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

export interface ServerDebugCoverageStats {
  withAuditScoreCount: number
  withAuditScorePct: number
  withAuditCompanyCount: number
  withAuditCompanyPct: number
  withImpactScoreCount: number
  withImpactScorePct: number
  withImpactCompanyCount: number
  withImpactCompanyPct: number
  withQolScoreCount: number
  withQolScorePct: number
  withQolCompanyCount: number
  withQolCompanyPct: number
  withClassificationCount: number
  withClassificationPct: number
  withClassificationCompanyCount: number
  withClassificationCompanyPct: number
  eligibleForBadgeCount: number
  eligibleForBadgePct: number
  eligibleForBadgeCompanyCount: number
  eligibleForBadgeCompanyPct: number
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
