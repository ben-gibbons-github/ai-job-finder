import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import {
  getCurrentCompanyAiScores,
  runUnifiedCompanyAiAsync,
} from './SearchCompanyAiUnified.js'

export interface AuditResult {
  auditScore: number
  auditText: string
  error?: string
}

function clampToPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function auditJob(job: ScrapedJob, shouldLog = false, shouldLaunch = false): number {
  const current = getCurrentCompanyAiScores(job)
  if (current.auditText.trim().length > 0 || current.auditScore > 0) {
    return clampToPercent(current.auditScore)
  }

  if (shouldLaunch) {
    void runUnifiedCompanyAiAsync(job, shouldLog)
  }

  return clampToPercent(current.auditScore)
}

export async function auditJobAsync(job: ScrapedJob, shouldLog = false): Promise<AuditResult> {
  const current = getCurrentCompanyAiScores(job)
  if (current.auditText.trim().length > 0 || current.auditScore > 0) {
    if (shouldLog) {
      console.log(
        `[SearchAudit] Using cached audit for company=${String(job.company_name ?? '').trim() || '?'} title=${String(job.name ?? '').trim() || '?'} score=${clampToPercent(current.auditScore)}`,
      )
    }
    return { auditScore: clampToPercent(current.auditScore), auditText: current.auditText }
  }

  if (shouldLog) {
    console.log(
      `[SearchAudit] Requesting unified audit for company=${String(job.company_name ?? '').trim() || '?'} title=${String(job.name ?? '').trim() || '?'} ` +
        `(source=${String(job.source ?? '').trim() || '?'}, url=${String(job.source_url ?? '').trim() || '?'})`,
    )
  }

  const unified = await runUnifiedCompanyAiAsync(job, shouldLog)
  const updated = getCurrentCompanyAiScores(job)

  const queuedWithoutScore = unified.queuedForBatch && updated.auditScore === 0 && updated.auditText.trim().length === 0
  return {
    auditScore: clampToPercent(updated.auditScore),
    auditText: updated.auditText,
    ...(queuedWithoutScore
      ? { error: 'Queued for external batch LLM processing' }
      : unified.error ? { error: unified.error } : {}),
  }
}
