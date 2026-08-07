import * as path from 'path'
import { fileURLToPath } from 'url'
import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import { CacheHandler } from '../utils/CacheHandler.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.resolve(moduleDir, '../../cache/impactcache.json')
const cacheHandler = new CacheHandler(CACHE_FILE)

interface CachedImpact {
  impactScore: number
  impactSummary: string
  timestamp?: number
}

class SearchImpactAICache {
  private cache: Map<string, CachedImpact> = new Map()

  constructor() {
    this.loadFromFile()
  }

  private getJobKey(job: ScrapedJob): string {
    const sourceUrl = job.source_url?.trim()
    if (sourceUrl) {
      return sourceUrl
    }
    return `${job.name}::${job.company_name}::${job.location}`
  }

  getCachedImpact(job: ScrapedJob): CachedImpact | null {
    const key = this.getJobKey(job)
    return this.cache.get(key) ?? null
  }

  setCachedImpact(job: ScrapedJob, result: CachedImpact): void {
    const key = this.getJobKey(job)
    this.cache.set(key, {
      impactScore: result.impactScore,
      impactSummary: result.impactSummary,
      timestamp: Date.now(),
    })
    this.saveToFile()
  }

  deleteCachedImpact(job: ScrapedJob): void {
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
        return value as Record<string, CachedImpact>
      })
      this.cache = new Map(Object.entries(parsed))
      console.log(`[SearchImpactAICache] Loaded ${this.cache.size} cached impact entries from ${CACHE_FILE}`)
    } catch (error) {
      console.warn(`[SearchImpactAICache] Failed to load cache from ${CACHE_FILE}:`, error)
      this.cache = new Map()
    }
  }

  private saveToFile(): void {
    setImmediate(() => {
      const obj = Object.fromEntries(this.cache)
      const payload = JSON.stringify(obj)
      cacheHandler.save(payload).catch((error) => {
        console.error(`[SearchImpactAICache] Failed to save cache to ${CACHE_FILE}:`, error)
      })
    })
  }
}

export default new SearchImpactAICache()
