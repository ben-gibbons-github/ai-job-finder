import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CacheHandler } from '../utils/CacheHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CACHE_FILE_PATH = path.resolve(__dirname, '../../cache/llmanswers.json')
const cacheHandler = new CacheHandler(CACHE_FILE_PATH)

type LLMAnswerCache = Record<string, string>

let cache: LLMAnswerCache = {}
let loadPromise: Promise<void> | null = null

async function ensureCacheLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    try {
      const parsed = await cacheHandler.loadWithFallback((raw) => JSON.parse(raw) as unknown)

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cache = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
            .map(([key, value]) => [key, value as string])
        )
      }
    } catch {
      cache = {}
    }
  })()

  return loadPromise
}

// Debounce cache writes so compression+disk-I/O only fires once per window,
// even when dozens of AI jobs complete in quick succession.
const SAVE_DEBOUNCE_MS = 10_000
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

function persistCache(): void {
  if (saveDebounceTimer !== null) return  // a save is already scheduled
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null
    setImmediate(() => {
      cacheHandler.save(JSON.stringify(cache)).catch(() => undefined)
    })
  }, SAVE_DEBOUNCE_MS)
}

export async function getCachedAnswer(question: string): Promise<string | null> {
  const key = question.trim()
  if (!key) {
    return null
  }

  await ensureCacheLoaded()
  return cache[key] ?? null
}

export async function setCachedAnswer(question: string, answer: string): Promise<void> {
  const key = question.trim()
  const value = answer.trim()
  if (!key || !value) {
    return
  }

  await ensureCacheLoaded()
  cache[key] = value
  persistCache()
}
