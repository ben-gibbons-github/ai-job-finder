import * as path from 'path'
import { fileURLToPath } from 'url'
import type { ScrapedEmployer } from './ScrapedEmployer.js'
import type { ScrapedJob } from './ScrapedJob.js'
import { CacheHandler } from '../../utils/CacheHandler.js'
import { isSqlOnlyCacheLoadingEnabled } from '../../utils/SqlOnlyCacheLoading.js'
import {
  readAllScrapedEmployerCacheRows,
  upsertScrapedEmployerCacheRow,
  deleteScrapedEmployerCacheRow,
} from '../../database/CacheDatabase.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.resolve(moduleDir, '../../cache/scrapedemployers.json')
const cacheHandler = new CacheHandler(CACHE_FILE)
export const DEFAULT_COMPANY_PROMPT_VERSION = '1.0'

interface CachedScrapedEmployer {
  employer: ScrapedEmployer
  timestamp?: number
}

function isGenericBuiltInEmployerName(name: string | undefined | null): boolean {
  return /^built\s*in(?:\b|healthtech\b|greentech\b|social\s+impact\b)/i.test(String(name ?? '').trim())
}

function sanitizeBuiltInContamination(employer: ScrapedEmployer): ScrapedEmployer {
  if (isGenericBuiltInEmployerName(employer.name)) {
    return employer
  }

  const summary = String(employer.ai_summary ?? '').trim()
  const impactSummary = String(employer.ai_impact_summary ?? '').trim()
  const qualitySummary = String(employer.employeeQualityOfLifeSummary ?? '').trim()

  const hasBuiltInLeak =
    /^built\s*in\b/i.test(summary)
    || /^built\s*in\b/i.test(impactSummary)
    || /^built\s*in\b/i.test(qualitySummary)
    || /\bnot built\s*in\b/i.test(qualitySummary)

  if (!hasBuiltInLeak) {
    return employer
  }

  return {
    ...employer,
    ai_summary: '',
    ai_red_flag_summary: '',
    ai_score: 0,
    ai_red_flag_score: 0,
    ai_impact_summary: '',
    ai_impact_score: 0,
    employeeQualityOfLifeScore: 0,
    employeeQualityOfLifeSummary: '',
  }
}

class ScrapedEmployerCache {
  private cache: Map<string, CachedScrapedEmployer> = new Map()

  constructor() {
    this.loadFromDatabase()
  }

  private normalizeEmployerName(name: string | undefined | null): string {
    return String(name ?? '').trim().toLowerCase()
  }

  private getEmployerKey(employer: ScrapedEmployer): string {
    return this.normalizeEmployerName(employer.name)
  }

  getCachedEmployerByName(name: string): ScrapedEmployer | null {
    const key = this.normalizeEmployerName(name)
    if (!key) {
      return null
    }

    const cached = this.cache.get(key)
    return cached
      ? {
          ...cached.employer,
          promptVersion: cached.employer.promptVersion?.trim() || DEFAULT_COMPANY_PROMPT_VERSION,
        }
      : null
  }

  getCachedEmployer(employer: ScrapedEmployer): ScrapedEmployer | null {
    return this.getCachedEmployerByName(employer.name)
  }

  setCachedEmployer(employer: ScrapedEmployer): void {
    const key = this.getEmployerKey(employer)
    if (!key) {
      return
    }

    console.log(
      `[ScrapedEmployerCache] setCachedEmployer key=${key} employer=${String(employer.name ?? '').trim()} ` +
      `ai_summary=${String(employer.ai_summary ?? '').slice(0, 120)} impact=${String(employer.ai_impact_summary ?? '').slice(0, 120)} qol=${String(employer.employeeQualityOfLifeSummary ?? '').slice(0, 120)}`,
    )

    this.cache.set(key, {
      employer: { ...employer },
      timestamp: Date.now(),
    })
    this.saveToDatabase(employer)
  }

  setCachedEmployers(employers: ScrapedEmployer[]): void {
    let didChange = false

    for (const employer of employers) {
      const key = this.getEmployerKey(employer)
      if (!key) {
        continue
      }
      this.cache.set(key, {
        employer: { ...employer },
        timestamp: Date.now(),
      })
      didChange = true
    }

    if (didChange) {
      for (const employer of employers) {
        this.saveToDatabase(employer)
      }
    }
  }

  hasEmployer(name: string): boolean {
    const key = this.normalizeEmployerName(name)
    return key ? this.cache.has(key) : false
  }

  deleteCachedEmployerByName(name: string): void {
    const key = this.normalizeEmployerName(name)
    if (!key) {
      return
    }

    if (this.cache.delete(key)) {
      deleteScrapedEmployerCacheRow(key)
    }
  }

  deleteCachedEmployer(employer: ScrapedEmployer): void {
    this.deleteCachedEmployerByName(employer.name)
  }

  getAllCachedEmployers(): ScrapedEmployer[] {
    return Array.from(this.cache.values(), (entry) => ({ ...entry.employer }))
  }

  get size(): number {
    return this.cache.size
  }

  clear(): void {
    if (this.cache.size === 0) {
      return
    }
    const keys = Array.from(this.cache.keys())
    this.cache.clear()
    for (const key of keys) {
      deleteScrapedEmployerCacheRow(key)
    }
  }

  private loadFromDatabase(): void {
    try {
      let rows = readAllScrapedEmployerCacheRows()
      if (rows.length === 0) {
        rows = this.importLegacyFileIfPresent()
      }

      for (const row of rows) {
        const employer = sanitizeBuiltInContamination({
          name: row.name,
          ai_summary: row.aiSummary,
          ai_red_flag_summary: row.aiRedFlagSummary,
          ai_score: row.aiScore,
          ai_red_flag_score: row.aiRedFlagScore,
          ai_impact_summary: row.aiImpactSummary,
          ai_impact_score: row.aiImpactScore,
          employeeQualityOfLifeScore: row.employeeQolScore,
          employeeQualityOfLifeSummary: row.employeeQolSummary,
          location_fallback: row.locationFallback,
          promptVersion: row.promptVersion,
          aiPrompt: row.aiPrompt,
        })
        this.cache.set(row.employerKey, {
          employer,
          timestamp: row.updatedAtMs,
        })
      }
      console.log(`[ScrapedEmployerCache] Loaded ${this.cache.size} cached employers from SQLite`)
    } catch (error) {
      console.warn('[ScrapedEmployerCache] Failed to load cache from SQLite:', error)
      this.cache = new Map()
    }
  }

  private saveToDatabase(employer: ScrapedEmployer): void {
    const sanitizedEmployer = sanitizeBuiltInContamination(employer)
    const key = this.getEmployerKey(sanitizedEmployer)
    if (!key) {
      return
    }

    upsertScrapedEmployerCacheRow({
      employerKey: key,
      name: sanitizedEmployer.name,
      aiSummary: sanitizedEmployer.ai_summary,
      aiRedFlagSummary: sanitizedEmployer.ai_red_flag_summary,
      aiScore: sanitizedEmployer.ai_score,
      aiRedFlagScore: sanitizedEmployer.ai_red_flag_score,
      aiImpactSummary: sanitizedEmployer.ai_impact_summary,
      aiImpactScore: sanitizedEmployer.ai_impact_score,
      employeeQolScore: sanitizedEmployer.employeeQualityOfLifeScore,
      employeeQolSummary: sanitizedEmployer.employeeQualityOfLifeSummary,
      locationFallback: sanitizedEmployer.location_fallback ?? '',
      promptVersion: sanitizedEmployer.promptVersion ?? DEFAULT_COMPANY_PROMPT_VERSION,
      aiPrompt: sanitizedEmployer.aiPrompt ?? '',
    })
  }

  private importLegacyFileIfPresent() {
    if (isSqlOnlyCacheLoadingEnabled()) {
      return []
    }

    try {
      const parsed = cacheHandler.loadWithFallbackSync((raw) => {
        const value = JSON.parse(raw) as unknown
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Cache payload is not a valid object')
        }
        return value as Record<string, CachedScrapedEmployer | ScrapedEmployer>
      })

      for (const [key, value] of Object.entries(parsed)) {
        const employer = value && typeof value === 'object' && 'employer' in value
          ? (value as CachedScrapedEmployer).employer
          : value as ScrapedEmployer
        const sanitizedEmployer = sanitizeBuiltInContamination(employer)
        upsertScrapedEmployerCacheRow({
          employerKey: key,
          name: sanitizedEmployer.name,
          aiSummary: sanitizedEmployer.ai_summary,
          aiRedFlagSummary: sanitizedEmployer.ai_red_flag_summary,
          aiScore: sanitizedEmployer.ai_score,
          aiRedFlagScore: sanitizedEmployer.ai_red_flag_score,
          aiImpactSummary: sanitizedEmployer.ai_impact_summary,
          aiImpactScore: sanitizedEmployer.ai_impact_score,
          employeeQolScore: sanitizedEmployer.employeeQualityOfLifeScore,
          employeeQolSummary: sanitizedEmployer.employeeQualityOfLifeSummary,
          locationFallback: sanitizedEmployer.location_fallback ?? '',
          promptVersion: sanitizedEmployer.promptVersion ?? DEFAULT_COMPANY_PROMPT_VERSION,
          aiPrompt: sanitizedEmployer.aiPrompt ?? '',
        })
      }

      const importedRows = readAllScrapedEmployerCacheRows()

      console.log(`[ScrapedEmployerCache] Imported ${importedRows.length} employers from legacy JSON into SQLite`)
      return importedRows
    } catch (error) {
      console.warn(`[ScrapedEmployerCache] Failed to import legacy cache from ${CACHE_FILE}:`, error)
      return []
    }
  }
}
const scrapedEmployerCache = new ScrapedEmployerCache()

export function getOrCreateEmployer(job: ScrapedJob): ScrapedEmployer {
  if (job.scrapedEmployer) {
    job.scrapedEmployer.promptVersion = job.scrapedEmployer.promptVersion?.trim()
      || DEFAULT_COMPANY_PROMPT_VERSION
    return job.scrapedEmployer
  }

  const employerName = String(job.company_name ?? '').trim() || 'Unknown Employer'
  const cached = scrapedEmployerCache.getCachedEmployerByName(employerName)
  const employer: ScrapedEmployer = cached ?? {
    name: employerName,
    ai_summary: '',
    ai_red_flag_summary: '',
    ai_score: 0,
    ai_red_flag_score: 0,
    ai_impact_summary: '',
    ai_impact_score: 0,
    employeeQualityOfLifeScore: 0,
    employeeQualityOfLifeSummary: '',
    promptVersion: DEFAULT_COMPANY_PROMPT_VERSION,
  }

  job.scrapedEmployer = employer
  if (!cached) {
    scrapedEmployerCache.setCachedEmployer(employer)
  }
  return employer
}

export default scrapedEmployerCache
