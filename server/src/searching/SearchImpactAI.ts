import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import {
  getCurrentCompanyAiScores,
  runUnifiedCompanyAiAsync,
} from './SearchCompanyAiUnified.js'

export interface ImpactAIResult {
  impactScore: number
  impactSummary: string
  error?: string
}

function clampToPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function impactJobAI(job: ScrapedJob, shouldLog = false, shouldLaunch = false): number {
  const current = getCurrentCompanyAiScores(job)
  if (current.impactSummary.trim().length > 0 || current.impactScore > 0) {
    return clampToPercent(current.impactScore)
  }

  if (shouldLaunch) {
    void runUnifiedCompanyAiAsync(job, shouldLog)
  }

  return clampToPercent(current.impactScore)
}

export async function impactJobAIAsync(job: ScrapedJob, shouldLog = false): Promise<ImpactAIResult> {
  const current = getCurrentCompanyAiScores(job)
  if (current.impactSummary.trim().length > 0 || current.impactScore > 0) {
    if (shouldLog) {
      console.log(
        `[SearchImpactAI] Using cached impact for company=${String(job.company_name ?? '').trim() || '?'} title=${String(job.name ?? '').trim() || '?'} score=${clampToPercent(current.impactScore)}`,
      )
    }
    return {
      impactScore: clampToPercent(current.impactScore),
      impactSummary: current.impactSummary,
    }
  }

  if (shouldLog) {
    console.log(
      `[SearchImpactAI] Requesting unified impact for company=${String(job.company_name ?? '').trim() || '?'} title=${String(job.name ?? '').trim() || '?'} ` +
        `(source=${String(job.source ?? '').trim() || '?'}, url=${String(job.source_url ?? '').trim() || '?'})`,
    )
  }

  const unified = await runUnifiedCompanyAiAsync(job, shouldLog)
  const updated = getCurrentCompanyAiScores(job)

  const queuedWithoutScore = unified.queuedForBatch && updated.impactScore === 0 && updated.impactSummary.trim().length === 0
  return {
    impactScore: clampToPercent(updated.impactScore),
    impactSummary: updated.impactSummary,
    ...(queuedWithoutScore
      ? { error: 'Queued for external batch LLM processing' }
      : unified.error ? { error: unified.error } : {}),
  }
}
