import searchAuditCache from '../searching/SearchAuditCache.js'
import searchImpactAICache from '../searching/SearchImpactAICache.js'
import searchQualityOfLifeCache from '../searching/SearchQualityOfLifeCache.js'
import type { ScrapedEmployer } from './ScrapedEmployer.js'
import type { ScrapedJob } from './ScrapedJob.js'

function isGenericBuiltInEmployerName(name: string | undefined | null): boolean {
  return /^built\s*in(?:\b|healthtech\b|greentech\b|social\s+impact\b)/i.test(String(name ?? '').trim())
}

function clearEmployerAiFields(employer: ScrapedEmployer): void {
  employer.ai_summary = ''
  employer.ai_red_flag_summary = ''
  employer.ai_score = 0
  employer.ai_red_flag_score = 0
  employer.ai_impact_summary = ''
  employer.ai_impact_score = 0
  employer.employeeQualityOfLifeSummary = ''
  employer.employeeQualityOfLifeScore = 0
}

function clearBuiltInContamination(job: ScrapedJob, employer: ScrapedEmployer): void {
  if (isGenericBuiltInEmployerName(employer.name) || isGenericBuiltInEmployerName(job.company_name)) {
    return
  }

  const summary = String(employer.ai_summary ?? '').trim()
  const impactSummary = String(employer.ai_impact_summary ?? '').trim()
  const qualitySummary = String(employer.employeeQualityOfLifeSummary ?? '').trim()

  const hasBuiltInLeak =
    /^built\s*in\b/i.test(summary)
    || /^built\s*in\b/i.test(impactSummary)
    || /^built\s*in\b/i.test(qualitySummary)
    || /\bnot built\s*in\b/i.test(qualitySummary)

  if (hasBuiltInLeak) {
    clearEmployerAiFields(employer)
  }
}

function clampToPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

function parseLegacyAuditText(auditText: string): { summary: string; companyQuality: number; redFlags: number } | null {
  const trimmed = String(auditText ?? '').trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      summary?: unknown
      companyQuality?: unknown
      jobQuality?: unknown
      redFlags?: unknown
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    const companyQuality = clampToPercent(Number(parsed.companyQuality ?? parsed.jobQuality))
    const redFlags = clampToPercent(Number(parsed.redFlags))
    return { summary, companyQuality, redFlags }
  } catch {
    return null
  }
}

function applyLegacyCachesToEmployer(job: ScrapedJob, employer: ScrapedEmployer): void {
  const cachedAudit = searchAuditCache.getCachedAudit(job)
  if (cachedAudit) {
    job.audit_number = clampToPercent(cachedAudit.auditScore)
    job.audit_text = cachedAudit.auditText

    const parsedAudit = parseLegacyAuditText(cachedAudit.auditText)
    if (parsedAudit) {
      employer.ai_score = parsedAudit.companyQuality
      employer.ai_red_flag_score = parsedAudit.redFlags
      if (parsedAudit.summary) {
        employer.ai_summary = parsedAudit.summary
      }
    } else {
      employer.ai_score = clampToPercent(cachedAudit.auditScore)
      if (!employer.ai_summary && cachedAudit.auditText.trim().length > 0) {
        employer.ai_summary = cachedAudit.auditText.trim().slice(0, 2000)
      }
    }
  } else if (job.audit_number > 0 && String(job.audit_text ?? '').trim().length > 0) {
    employer.ai_score = clampToPercent(job.audit_number)
    const parsedAudit = parseLegacyAuditText(job.audit_text)
    if (parsedAudit) {
      employer.ai_red_flag_score = parsedAudit.redFlags
      if (parsedAudit.summary) {
        employer.ai_summary = parsedAudit.summary
      }
    }
  }

  const cachedImpact = searchImpactAICache.getCachedImpact(job)
  if (cachedImpact) {
    employer.ai_impact_score = clampToPercent(cachedImpact.impactScore)
    employer.ai_impact_summary = String(cachedImpact.impactSummary ?? '').trim()
  }

  const cachedQualityOfLife = searchQualityOfLifeCache.getCachedQualityOfLife(job)
  if (cachedQualityOfLife) {
    employer.employeeQualityOfLifeScore = clampToPercent(cachedQualityOfLife.employeeQualityOfLifeScore)
    employer.employeeQualityOfLifeSummary = String(cachedQualityOfLife.employeeQualityOfLifeSummary ?? '').trim()
  }

  clearBuiltInContamination(job, employer)
}

export function gatherLegacyAIData(jobs: ScrapedJob[], employerDatastore: Map<string, ScrapedEmployer>): void {
  for (const job of jobs) {
    const employer = job.scrapedEmployer
    if (!employer) {
      continue
    }

    applyLegacyCachesToEmployer(job, employer)

    const key = String(employer.name ?? '').trim().toLowerCase()
    if (!key) {
      continue
    }
    employerDatastore.set(key, employer)
  }
}
