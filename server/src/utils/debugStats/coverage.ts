import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import type { ScrapeLoadDebugStats } from '../../scraping/core/ScrapeDebugTelemetry.js'
import { getJobDebugFlag } from '../../searching/searchMain/SearchMain.js'
import { getCacheDatabaseSchemaOutline } from '../../database/CacheDatabase.js'
import { getEmployerImpactCategoriesForJob } from '../../searching/EmployerImpactCategoryStore.js'
import { getCacheIoDebugSummary } from '../CacheIoTelemetry.js'
import { isEmployerEligibleForImpactBadge } from '../EmployerBadgeEligibility.js'
import { computeEmployerConcentrationStats } from './employerConcentration.js'
import { average, clampScoreValue, countTextWords, summarizeScore } from './scoreSummary.js'
import type { ServerDebugCoverageStats } from './types.js'

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

function normalizeCompanyName(name: string): string {
  return String(name ?? '').trim().toLowerCase()
}

function getCompanyKey(job: ScrapedJob): string {
  return normalizeCompanyName(job.scrapedEmployer?.name || job.company_name) || 'unknown employer'
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

  const auditSummaryLens = employersWithAnyAiData.map((employer) => String(employer.ai_summary ?? '').trim())
  const impactSummaryTexts = employersWithAnyAiData.map((employer) => String(employer.ai_impact_summary ?? '').trim())
  const qolSummaryTexts = employersWithAnyAiData.map((employer) => String(employer.employeeQualityOfLifeSummary ?? '').trim())

  const auditSummaryCharLens = auditSummaryLens.map((text) => text.length).filter((length) => length > 0)
  const impactSummaryCharLens = impactSummaryTexts.map((text) => text.length).filter((length) => length > 0)
  const qolSummaryCharLens = qolSummaryTexts.map((text) => text.length).filter((length) => length > 0)

  const auditSummaryWordLens = auditSummaryLens.map((text) => countTextWords(text)).filter((count) => count > 0)
  const impactSummaryWordLens = impactSummaryTexts.map((text) => countTextWords(text)).filter((count) => count > 0)
  const qolSummaryWordLens = qolSummaryTexts.map((text) => countTextWords(text)).filter((count) => count > 0)

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

  const auditScores = employersWithAnyAiData
    .filter((employer) => Number(employer.ai_score ?? 0) > 0 || String(employer.ai_summary ?? '').trim().length > 0)
    .map((employer) => clampScoreValue(Number(employer.ai_score ?? 0)))
  const impactScores = employersWithAnyAiData
    .filter((employer) => Number(employer.ai_impact_score ?? 0) > 0 || String(employer.ai_impact_summary ?? '').trim().length > 0)
    .map((employer) => clampScoreValue(Number(employer.ai_impact_score ?? 0)))
  const qolScores = employersWithAnyAiData
    .filter((employer) => Number(employer.employeeQualityOfLifeScore ?? 0) > 0 || String(employer.employeeQualityOfLifeSummary ?? '').trim().length > 0)
    .map((employer) => clampScoreValue(Number(employer.employeeQualityOfLifeScore ?? 0)))

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

export function computeServerDebugCoverageStats(jobs: ScrapedJob[], scrapeLoad: ScrapeLoadDebugStats): ServerDebugCoverageStats {
  const total = Math.max(1, jobs.length)

  let withAuditScoreCount = 0
  let withImpactScoreCount = 0
  let withQolScoreCount = 0
  let withClassificationCount = 0
  let eligibleForBadgeCount = 0
  const auditCompanies = new Set<string>()
  const impactCompanies = new Set<string>()
  const qolCompanies = new Set<string>()
  const classificationCompanies = new Set<string>()
  const eligibleForBadgeCompanies = new Set<string>()
  let missingDescriptionCount = 0
  let geocodedCount = 0
  const sourceCounts = new Map<string, number>()
  const missingDescriptionSourceCounts = new Map<string, number>()
  const debugStatusCounts = new Map<string, number>()

  for (const job of jobs) {
    const companyKey = getCompanyKey(job)
    if (hasAuditScore(job)) {
      withAuditScoreCount += 1
      auditCompanies.add(companyKey)
    }
    if (hasImpactScore(job)) {
      withImpactScoreCount += 1
      impactCompanies.add(companyKey)
    }
    if (hasQolScore(job)) {
      withQolScoreCount += 1
      qolCompanies.add(companyKey)
    }
    const isEligibleForBadge = isEmployerEligibleForImpactBadge(job.scrapedEmployer)
    if (isEligibleForBadge) {
      eligibleForBadgeCount += 1
      eligibleForBadgeCompanies.add(companyKey)
    }
    if (isEligibleForBadge && getEmployerImpactCategoriesForJob(job).length > 0) {
      withClassificationCount += 1
      classificationCompanies.add(companyKey)
    }
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
  const totalCompanies = Math.max(1, new Set(jobs.map(getCompanyKey)).size)
  const companyPct = (count: number) => Number(((count / totalCompanies) * 100).toFixed(1))
  const eligiblePct = (count: number) => (eligibleForBadgeCount > 0 ? Number(((count / eligibleForBadgeCount) * 100).toFixed(1)) : 0)
  const eligibleCompanyPct = (count: number) => (eligibleForBadgeCompanies.size > 0 ? Number(((count / eligibleForBadgeCompanies.size) * 100).toFixed(1)) : 0)
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
    withAuditCompanyCount: auditCompanies.size,
    withAuditCompanyPct: companyPct(auditCompanies.size),
    withImpactScoreCount,
    withImpactScorePct: pct(withImpactScoreCount),
    withImpactCompanyCount: impactCompanies.size,
    withImpactCompanyPct: companyPct(impactCompanies.size),
    withQolScoreCount,
    withQolScorePct: pct(withQolScoreCount),
    withQolCompanyCount: qolCompanies.size,
    withQolCompanyPct: companyPct(qolCompanies.size),
    withClassificationCount,
    withClassificationPct: eligiblePct(withClassificationCount),
    withClassificationCompanyCount: classificationCompanies.size,
    withClassificationCompanyPct: eligibleCompanyPct(classificationCompanies.size),
    eligibleForBadgeCount,
    eligibleForBadgePct: pct(eligibleForBadgeCount),
    eligibleForBadgeCompanyCount: eligibleForBadgeCompanies.size,
    eligibleForBadgeCompanyPct: companyPct(eligibleForBadgeCompanies.size),
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
