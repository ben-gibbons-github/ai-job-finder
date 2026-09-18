import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { getEffectiveUnifiedCompanyAiScores } from '../SearchCompanyAiUnified.js'
import type { JobAiPayload, RankedJobWrapper, ScoreWeights, SearchAiCoverage, SearchScoreBucket } from '../SearchInterfaces.js'

function toPercent(part: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Number(((part / total) * 100).toFixed(1))
}

export function buildJobAiPayload(job: ScrapedJob): JobAiPayload | undefined {
  const employer = job.scrapedEmployer
  if (!employer) {
    return undefined
  }

  const auditSummary = String(employer.ai_summary ?? '').trim()
  const auditRedFlagSummary = String(employer.ai_red_flag_summary ?? '').trim()
  const impactSummary = String(employer.ai_impact_summary ?? '').trim()
  const qualityOfLifeSummary = String(employer.employeeQualityOfLifeSummary ?? '').trim()

  const effectiveScores = getEffectiveUnifiedCompanyAiScores(employer)
  const auditScore = Number(effectiveScores.auditScore)
  const redFlagScore = Number(effectiveScores.redFlagScore)
  const impactScore = Number(effectiveScores.impactScore)
  const qualityOfLifeScore = Number(effectiveScores.qualityOfLifeScore)

  return {
    audit: {
      hasData:
        auditSummary.length > 0 ||
        auditRedFlagSummary.length > 0 ||
        Number.isFinite(auditScore) && auditScore > 0 ||
        Number.isFinite(redFlagScore) && redFlagScore > 0,
      score: Number.isFinite(auditScore) ? auditScore : 0,
      redFlagScore: Number.isFinite(redFlagScore) ? redFlagScore : 0,
      summary: auditSummary,
      redFlagSummary: auditRedFlagSummary,
    },
    impact: {
      hasData: impactSummary.length > 0 || (Number.isFinite(impactScore) && impactScore > 0),
      score: Number.isFinite(impactScore) ? impactScore : 0,
      summary: impactSummary,
    },
    qualityOfLife: {
      hasData: qualityOfLifeSummary.length > 0 || (Number.isFinite(qualityOfLifeScore) && qualityOfLifeScore > 0),
      score: Number.isFinite(qualityOfLifeScore) ? qualityOfLifeScore : 0,
      summary: qualityOfLifeSummary,
    },
  }
}

export function buildSearchAiCoverage(wrappers: RankedJobWrapper[]): SearchAiCoverage {
  const totalMatched = wrappers.length
  const auditCount = wrappers.filter((wrapper) => wrapper.aiPayload?.audit?.hasData === true).length
  const impactCount = wrappers.filter((wrapper) => wrapper.aiPayload?.impact?.hasData === true).length
  const qualityOfLifeCount = wrappers.filter((wrapper) => wrapper.aiPayload?.qualityOfLife?.hasData === true).length
  const geocodedCount = wrappers.filter((wrapper) => {
    const lat = Number(wrapper.job.location_lat)
    const lon = Number(wrapper.job.location_lon)
    return Number.isFinite(lat) && Number.isFinite(lon)
  }).length

  return {
    auditPercent: toPercent(auditCount, totalMatched),
    impactPercent: toPercent(impactCount, totalMatched),
    qualityOfLifePercent: toPercent(qualityOfLifeCount, totalMatched),
    geocodedPercent: toPercent(geocodedCount, totalMatched),
    totalMatched,
  }
}

export function buildScoreDistribution(
  wrappers: RankedJobWrapper[],
  scoreWeights?: ScoreWeights,
): SearchScoreBucket[] {
  const buckets = new Map<number, number>()
  const sumOfWeights = scoreWeights
    ? scoreWeights.resume
      + scoreWeights.impact
      + scoreWeights.location
      + scoreWeights.fresh
      + scoreWeights.audit
      + scoreWeights.qualityOfLife
    : 6

  for (const wrapper of wrappers) {
    const totalScore = Number(wrapper.totalScore ?? 0)
    const scorePercent = sumOfWeights > 0
      ? Math.max(0, Math.min(100, (totalScore / sumOfWeights) * 100))
      : 0
    if (!Number.isFinite(scorePercent)) {
      continue
    }
    const bucketStart = Math.floor(scorePercent)
    buckets.set(bucketStart, (buckets.get(bucketStart) ?? 0) + 1)
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([start, count]) => ({
      start,
      end: start,
      count,
    }))
}
