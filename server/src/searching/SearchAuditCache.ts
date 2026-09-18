import * as path from 'path'
import { fileURLToPath } from 'url'
import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import type { AuditResult } from './SearchAudit.js'
import { CacheHandler } from '../utils/CacheHandler.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.resolve(moduleDir, '../../cache/auditcache.json')
const cacheHandler = new CacheHandler(CACHE_FILE)

interface CachedAudit {
  auditScore: number
  auditText: string
  timestamp?: number
}

class SearchAuditCache {
  private cache: Map<string, CachedAudit> = new Map()

  constructor() {
    this.loadFromFile()
  }

  private normalizeJobKeyPart(value: unknown): string {
    return String(value ?? '').trim().toLowerCase()
  }

  private getJobKey(job: ScrapedJob): string {
    const sourceUrl = job.source_url?.trim()
    const company = this.normalizeJobKeyPart(job.company_name)
    const title = this.normalizeJobKeyPart(job.name)
    const location = this.normalizeJobKeyPart(job.location)
    if (sourceUrl) {
      return `${sourceUrl}::${company}::${title}::${location}`
    }
    return `${title}::${company}::${location}`
  }

  getCachedAudit(job: ScrapedJob): AuditResult | null {
    const key = this.getJobKey(job)
    const cached = this.cache.get(key)
    if (cached) {
      return {
        auditScore: cached.auditScore,
        auditText: cached.auditText,
      }
    }
    return null
  }

  setCachedAudit(job: ScrapedJob, result: AuditResult): void {
    const key = this.getJobKey(job)
    this.cache.set(key, {
      auditScore: result.auditScore,
      auditText: result.auditText,
      timestamp: Date.now(),
    })
    this.saveToFile()
  }

  deleteCachedAudit(job: ScrapedJob): void {
    const key = this.getJobKey(job)
    if (this.cache.delete(key)) {
      this.saveToFile()
    }
  }

  private loadFromFile(): void {
    try {
      const parsed = cacheHandler.loadWithFallbackSync((raw) => {
        const value = JSON.parse(raw) as unknown
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Cache payload is not a valid object')
        }
        return value as Record<string, CachedAudit>
      })
      this.cache = new Map(Object.entries(parsed))
      console.log(`[SearchAuditCache] Loaded ${this.cache.size} cached audits from ${CACHE_FILE}`)
    } catch (error) {
      console.warn(`[SearchAuditCache] Failed to load cache from ${CACHE_FILE}:`, error)
      this.cache = new Map()
    }
  }

  private saveToFile(): void {
    setImmediate(() => {
      const obj = Object.fromEntries(this.cache)
      const payload = JSON.stringify(obj)
      cacheHandler.save(payload).catch((error) => {
        console.error(`[SearchAuditCache] Failed to save cache to ${CACHE_FILE}:`, error)
      })
    })
  }
}

export default new SearchAuditCache()
