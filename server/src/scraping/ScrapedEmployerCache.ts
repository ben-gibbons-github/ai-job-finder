import * as path from 'path'
import { fileURLToPath } from 'url'
import type { ScrapedEmployer } from './ScrapedEmployer.js'
import type { ScrapedJob } from './ScrapedJob.js'
import { CacheHandler } from '../utils/CacheHandler.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.resolve(moduleDir, '../../cache/scrapedemployers.json')
const cacheHandler = new CacheHandler(CACHE_FILE)

interface CachedScrapedEmployer {
  employer: ScrapedEmployer
  timestamp?: number
}

class ScrapedEmployerCache {
  private cache: Map<string, CachedScrapedEmployer> = new Map()

  constructor() {
    this.loadFromFile()
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
    return cached ? { ...cached.employer } : null
  }

  getCachedEmployer(employer: ScrapedEmployer): ScrapedEmployer | null {
    return this.getCachedEmployerByName(employer.name)
  }

  setCachedEmployer(employer: ScrapedEmployer): void {
    const key = this.getEmployerKey(employer)
    if (!key) {
      return
    }

    this.cache.set(key, {
      employer: { ...employer },
      timestamp: Date.now(),
    })
    this.saveToFile()
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
      this.saveToFile()
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
      this.saveToFile()
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
    this.cache.clear()
    this.saveToFile()
  }

  private loadFromFile(): void {
    try {
      const parsed = cacheHandler.loadWithFallbackSync((raw) => {
        const value = JSON.parse(raw) as unknown
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Cache payload is not a valid object')
        }
        return value as Record<string, CachedScrapedEmployer | ScrapedEmployer>
      })

      const normalizedEntries = Object.entries(parsed).map(([key, value]) => {
        if (value && typeof value === 'object' && 'employer' in value) {
          const cachedValue = value as CachedScrapedEmployer
          return [key, cachedValue] as const
        }

        const legacyValue = value as ScrapedEmployer
        return [
          key,
          {
            employer: legacyValue,
          },
        ] as const
      })

      this.cache = new Map(normalizedEntries)
      console.log(`[ScrapedEmployerCache] Loaded ${this.cache.size} cached employers from ${CACHE_FILE}`)
    } catch (error) {
      console.warn(`[ScrapedEmployerCache] Failed to load cache from ${CACHE_FILE}:`, error)
      this.cache = new Map()
    }
  }

  private saveToFile(): void {
    // Defer to next event-loop tick so serialization doesn't block the caller.
    // Compact JSON (no pretty-print) cuts file size ~50% and halves stringify time.
    setImmediate(() => {
      const obj = Object.fromEntries(this.cache)
      const payload = JSON.stringify(obj)
      cacheHandler.save(payload).catch((error) => {
        console.error(`[ScrapedEmployerCache] Failed to save cache to ${CACHE_FILE}:`, error)
      })
    })
  }
}
const scrapedEmployerCache = new ScrapedEmployerCache()

export function getOrCreateEmployer(job: ScrapedJob): ScrapedEmployer {
  if (job.scrapedEmployer) {
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
  }

  job.scrapedEmployer = employer
  if (!cached) {
    scrapedEmployerCache.setCachedEmployer(employer)
  }
  return employer
}

export default scrapedEmployerCache
