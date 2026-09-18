import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  readAllLlmAnswers,
  upsertLlmAnswer,
} from '../database/CacheDatabase.js'
import {
  recordDatabaseRead,
  recordDatabaseWrite,
  recordHybridCacheFlow,
  registerDatabasePath,
} from '../utils/CacheIoTelemetry.js'
import { CACHE_DB_FILE } from '../database/CacheDatabase.js'
import { decodeLegacyCachePayload } from '../utils/LegacyCacheDecode.js'
import { logBackgroundTaskEnd, logBackgroundTaskStart } from '../utils/BackgroundTaskTiming.js'
import { isSqlOnlyCacheLoadingEnabled } from '../utils/SqlOnlyCacheLoading.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CACHE_FILE_PATH = path.resolve(__dirname, '../../cache/llmanswers.json')
registerDatabasePath(CACHE_FILE_PATH, 'sqlite', CACHE_DB_FILE)

export const LEGACY_PROMPT_VERSION = '1.0'

interface LLMAnswerCacheEntry {
  answer: string
  promptVersion: string
}

type LLMAnswerCache = Record<string, LLMAnswerCacheEntry>

let cache: LLMAnswerCache = {}
let loadPromise: Promise<void> | null = null
const dirtyQuestions = new Set<string>()
let persistInFlight = false

async function ensureCacheLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    try {
      const dbRows = readAllLlmAnswers()
      if (dbRows.length > 0) {
        recordDatabaseRead(CACHE_FILE_PATH, true)
        recordHybridCacheFlow(CACHE_FILE_PATH, 'db-read-hit')
        cache = Object.fromEntries(
          dbRows
            .filter((row) => row.question && row.answer && row.promptVersion)
            .map((row) => [
              row.question,
              { answer: row.answer, promptVersion: row.promptVersion },
            ]),
        )
        return
      }

      recordDatabaseRead(CACHE_FILE_PATH, false)
      recordHybridCacheFlow(CACHE_FILE_PATH, 'db-read-miss')

      if (isSqlOnlyCacheLoadingEnabled()) {
        cache = {}
        return
      }

      const raw = await fs.readFile(CACHE_FILE_PATH, 'utf8')
      const parsed = JSON.parse(decodeLegacyCachePayload(raw)) as unknown

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cache = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .flatMap(([key, value]): Array<[string, LLMAnswerCacheEntry]> => {
              if (typeof value === 'string') {
                return [[key, { answer: value, promptVersion: LEGACY_PROMPT_VERSION }]]
              }
              if (!value || typeof value !== 'object' || Array.isArray(value)) {
                return []
              }

              const entry = value as Record<string, unknown>
              const answer = typeof entry.answer === 'string' ? entry.answer.trim() : ''
              if (!answer) {
                return []
              }
              const promptVersion = typeof entry.promptVersion === 'string' && entry.promptVersion.trim()
                ? entry.promptVersion.trim()
                : LEGACY_PROMPT_VERSION
              return [[key, { answer, promptVersion }]]
            })
        )

        for (const [question, entry] of Object.entries(cache)) {
          upsertLlmAnswer({
            question,
            promptVersion: entry.promptVersion,
            answer: entry.answer,
          })
        }
        if (Object.keys(cache).length > 0) {
          recordHybridCacheFlow(CACHE_FILE_PATH, 'legacy-read-hit')
          recordDatabaseWrite(CACHE_FILE_PATH)
          recordHybridCacheFlow(CACHE_FILE_PATH, 'db-hydrate-write')
        }
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
    const debounceFlushStart = logBackgroundTaskStart('LLMCache:debouncedFlush', {
      cacheEntries: Object.keys(cache).length,
    })
    saveDebounceTimer = null
    setImmediate(() => {
      if (persistInFlight) {
        persistCache()
        return
      }
      persistInFlight = true
      const persistStart = logBackgroundTaskStart('LLMCache:persistCache', {
        cacheEntries: Object.keys(cache).length,
        dirtyQuestions: dirtyQuestions.size,
      })
      try {
        const questionsToFlush = Array.from(dirtyQuestions)
        dirtyQuestions.clear()
        for (const question of questionsToFlush) {
          const entry = cache[question]
          if (!entry) {
            continue
          }
          upsertLlmAnswer({
            question,
            promptVersion: entry.promptVersion,
            answer: entry.answer,
          })
        }
        if (questionsToFlush.length > 0) {
          recordDatabaseWrite(CACHE_FILE_PATH)
          recordHybridCacheFlow(CACHE_FILE_PATH, 'db-direct-write')
        }
        logBackgroundTaskEnd('LLMCache:persistCache', persistStart, {
          cacheEntries: Object.keys(cache).length,
          flushedQuestions: questionsToFlush.length,
          dirtyQuestionsRemaining: dirtyQuestions.size,
        })
      } finally {
        persistInFlight = false
        if (dirtyQuestions.size > 0) {
          persistCache()
        }
        logBackgroundTaskEnd('LLMCache:debouncedFlush', debounceFlushStart, {
          cacheEntries: Object.keys(cache).length,
          dirtyQuestionsRemaining: dirtyQuestions.size,
        })
      }
    })
  }, SAVE_DEBOUNCE_MS)
}

export async function getCachedAnswer(
  question: string,
  promptVersion = LEGACY_PROMPT_VERSION,
): Promise<string | null> {
  const key = question.trim()
  if (!key) {
    return null
  }

  await ensureCacheLoaded()
  const entry = cache[key]
  return entry?.promptVersion === promptVersion ? entry.answer : null
}

export async function setCachedAnswer(
  question: string,
  answer: string,
  promptVersion = LEGACY_PROMPT_VERSION,
): Promise<void> {
  const key = question.trim()
  const value = answer.trim()
  if (!key || !value) {
    return
  }

  await ensureCacheLoaded()
  cache[key] = {
    answer: value,
    promptVersion: promptVersion.trim() || LEGACY_PROMPT_VERSION,
  }
  dirtyQuestions.add(key)
  persistCache()
}

export async function warmLlmAnswerCache(): Promise<number> {
  await ensureCacheLoaded()
  return Object.keys(cache).length
}
