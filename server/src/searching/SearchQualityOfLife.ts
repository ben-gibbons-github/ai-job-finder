import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import {
  getCurrentCompanyAiScores,
  runUnifiedCompanyAiAsync,
} from './SearchCompanyAiUnified.js'

export interface QualityOfLifeResult {
  employeeQualityOfLifeScore: number
  employeeQualityOfLifeSummary: string
  error?: string
}

function clampToPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function qualityOfLifeJob(job: ScrapedJob, shouldLog = false, shouldLaunch = false): number {
  const current = getCurrentCompanyAiScores(job)
  if (current.qualityOfLifeSummary.trim().length > 0 || current.qualityOfLifeScore > 0) {
    return clampToPercent(current.qualityOfLifeScore)
  }

  if (shouldLaunch) {
    void runUnifiedCompanyAiAsync(job, shouldLog)
  }

  return clampToPercent(current.qualityOfLifeScore)
}

export async function qualityOfLifeJobAsync(job: ScrapedJob, shouldLog = false): Promise<QualityOfLifeResult> {
  const current = getCurrentCompanyAiScores(job)
  if (current.qualityOfLifeSummary.trim().length > 0 || current.qualityOfLifeScore > 0) {
    if (shouldLog) {
      console.log(
        `[SearchQualityOfLife] Using cached quality-of-life for company=${String(job.company_name ?? '').trim() || '?'} title=${String(job.name ?? '').trim() || '?'} score=${clampToPercent(current.qualityOfLifeScore)}`,
      )
    }
    return {
      employeeQualityOfLifeScore: clampToPercent(current.qualityOfLifeScore),
      employeeQualityOfLifeSummary: current.qualityOfLifeSummary,
    }
  }

  if (shouldLog) {
    console.log(
      `[SearchQualityOfLife] Requesting unified quality-of-life for company=${String(job.company_name ?? '').trim() || '?'} title=${String(job.name ?? '').trim() || '?'} ` +
        `(source=${String(job.source ?? '').trim() || '?'}, url=${String(job.source_url ?? '').trim() || '?'})`,
    )
  }

  const unified = await runUnifiedCompanyAiAsync(job, shouldLog)
  const updated = getCurrentCompanyAiScores(job)

  const queuedWithoutScore = unified.queuedForBatch && updated.qualityOfLifeScore === 0 && updated.qualityOfLifeSummary.trim().length === 0
  return {
    employeeQualityOfLifeScore: clampToPercent(updated.qualityOfLifeScore),
    employeeQualityOfLifeSummary: updated.qualityOfLifeSummary,
    ...(queuedWithoutScore
      ? { error: 'Queued for external batch LLM processing' }
      : unified.error ? { error: unified.error } : {}),
  }
}
