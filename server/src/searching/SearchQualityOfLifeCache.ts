import * as path from 'path'
import { fileURLToPath } from 'url'
import type { ScrapedJob } from '../scraping/ScrapedJob.js'
import type { QualityOfLifeResult } from './SearchQualityOfLife.js'
import { CacheHandler } from '../utils/CacheHandler.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.resolve(moduleDir, '../../cache/qualityoflifecache.json')
const cacheHandler = new CacheHandler(CACHE_FILE)

interface CachedQualityOfLife {
  employeeQualityOfLifeScore: number
  employeeQualityOfLifeSummary: string
  timestamp?: number
}

class SearchQualityOfLifeCache {
  private cache: Map<string, CachedQualityOfLife> = new Map()

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

  getCachedQualityOfLife(job: ScrapedJob): QualityOfLifeResult | null {
    const key = this.getJobKey(job)
    const cached = this.cache.get(key)
    if (cached) {
      return {
        employeeQualityOfLifeScore: cached.employeeQualityOfLifeScore,
        employeeQualityOfLifeSummary: cached.employeeQualityOfLifeSummary,
      }
    }
    return null
  }

  setCachedQualityOfLife(job: ScrapedJob, result: QualityOfLifeResult): void {
    const key = this.getJobKey(job)
    this.cache.set(key, {
      employeeQualityOfLifeScore: result.employeeQualityOfLifeScore,
      employeeQualityOfLifeSummary: result.employeeQualityOfLifeSummary,
      timestamp: Date.now(),
    })
    this.saveToFile()
  }

  deleteCachedQualityOfLife(job: ScrapedJob): void {
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
        return value as Record<string, CachedQualityOfLife>
      })
      this.cache = new Map(Object.entries(parsed))
      console.log(`[SearchQualityOfLifeCache] Loaded ${this.cache.size} cached QoL scores from ${CACHE_FILE}`)
    } catch (error) {
      console.warn(`[SearchQualityOfLifeCache] Failed to load cache from ${CACHE_FILE}:`, error)
      this.cache = new Map()
    }
  }

  private saveToFile(): void {
    setImmediate(() => {
      const obj = Object.fromEntries(this.cache)
      const payload = JSON.stringify(obj)
      cacheHandler.save(payload).catch((error) => {
        console.error(`[SearchQualityOfLifeCache] Failed to save cache to ${CACHE_FILE}:`, error)
      })
    })
  }
}

export default new SearchQualityOfLifeCache()
