import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import type { UserRatingMode } from '../SearchInterfaces.js'

export function normalizeExactUrl(value: unknown): string {
  return String(value ?? '').trim()
}

export function normalizeExactCompanyName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizePromptVersion(value: unknown): string {
  return String(value ?? '').trim() || '1.0'
}

export function getJobDebugFlag(job: ScrapedJob): string | undefined {
  const promptVersion = normalizePromptVersion(job.scrapedEmployer?.promptVersion)
  const impactScore = Number(job.scrapedEmployer?.ai_impact_score ?? 0)
  if ((promptVersion === '3.0' || promptVersion === '4.0' || promptVersion === '5.0') && impactScore > 60) {
    return 'AI recalculation'
  }
  return undefined
}

export function normalizePromptVersionFilter(value: unknown): string {
  return String(value ?? '').trim()
}

export function parseUserRatingMode(value: unknown): UserRatingMode {
  if (value === 'none' || value === 'sort' || value === 'ratedOnly' || value === 'hideRated') {
    return value
  }
  return 'none'
}

export function normalizeUserScore(value: unknown): number | null {
  const score = Number(value)
  if (!Number.isFinite(score)) {
    return null
  }
  return Math.max(0, Math.min(100, score))
}

export function buildUserRatingMap(raw: unknown, normalizeKey: (value: unknown) => string): Map<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return new Map<string, number>()
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => {
      const normalizedKey = normalizeKey(key)
      const normalizedScore = normalizeUserScore(value)
      return [normalizedKey, normalizedScore] as const
    })
    .filter(([key, score]) => key.length > 0 && score !== null)

  return new Map(entries as Array<[string, number]>)
}

export function getRatedCompanyKeys(job: ScrapedJob): string[] {
  const keys = [
    normalizeExactCompanyName(job.company_name),
    normalizeExactCompanyName(job.scrapedEmployer?.name),
  ].filter((value) => value.length > 0)

  return Array.from(new Set(keys))
}

export function getEffectiveUserRating(
  job: ScrapedJob,
  companyRatingMap: Map<string, number>,
): number | null {
  const companyKeys = getRatedCompanyKeys(job)
  for (const companyKey of companyKeys) {
    const companyRating = companyRatingMap.get(companyKey)
    if (typeof companyRating === 'number') {
      return companyRating
    }
  }

  return null
}

export function hasAnyUserRating(job: ScrapedJob, ratedCompanies: Set<string>): boolean {
  const companyKeys = getRatedCompanyKeys(job)
  return companyKeys.some((companyKey) => ratedCompanies.has(companyKey))
}

export function sanitizeAddedJobs(raw: unknown): ScrapedJob[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return []
  }

  const jobs: ScrapedJob[] = []
  const nowIso = new Date().toISOString()

  for (let index = 0; index < raw.length; index += 1) {
    const row = raw[index]
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }

    const obj = row as Record<string, unknown>
    const name = String(obj.name ?? '').trim()
    const companyName = String(obj.company_name ?? '').trim()
    if (!name || !companyName) {
      continue
    }

    const sourceUrlRaw = String(obj.source_url ?? '').trim()
    const sourceUrl = sourceUrlRaw || `local://added-job/${Date.now()}-${index}`
    const userScore = normalizeUserScore(obj.userScore)
    const ratingBoost = typeof userScore === 'number' ? Math.max(0.45, userScore / 100) : 0.25

    jobs.push({
      name,
      company_name: companyName,
      location: String(obj.location ?? 'Unknown').trim() || 'Unknown',
      remote: String(obj.remote ?? 'Unknown').trim() || 'Unknown',
      location_lon: 0,
      location_lat: 0,
      description: String(obj.description ?? '').trim(),
      type: String(obj.type ?? 'Unknown').trim() || 'Unknown',
      source: 'AddedByUser',
      source_url: sourceUrl,
      posted: String(obj.posted ?? '').trim() || nowIso,
      last_scraped_at: nowIso,
      impact_number: 0,
      audit_number: Math.round(ratingBoost * 100),
      audit_text: '',
      tags: ['User Added'],
    })
  }

  return jobs
}

export function mergeAddedJobs(baseJobs: ScrapedJob[], addedJobs: ScrapedJob[]): ScrapedJob[] {
  if (addedJobs.length === 0) {
    return baseJobs
  }

  const dedup = new Map<string, ScrapedJob>()
  for (const job of addedJobs) {
    const sourceUrl = normalizeExactUrl(job.source_url)
    if (!sourceUrl) {
      continue
    }
    dedup.set(sourceUrl, job)
  }

  for (const job of baseJobs) {
    const sourceUrl = normalizeExactUrl(job.source_url)
    if (!sourceUrl || dedup.has(sourceUrl)) {
      continue
    }
    dedup.set(sourceUrl, job)
  }

  return Array.from(dedup.values())
}

export function buildJobAiLookupKey(job: ScrapedJob): string {
  const sourceUrl = String(job.source_url ?? '').trim()
  const company = String(job.company_name ?? '').trim().toLowerCase()
  const title = String(job.name ?? '').trim().toLowerCase()
  const location = String(job.location ?? '').trim().toLowerCase()

  if (sourceUrl) {
    return `${sourceUrl}::${company}::${title}::${location}`
  }
  return `${title}::${company}::${location}`
}
