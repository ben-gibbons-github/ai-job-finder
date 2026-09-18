import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface LlmBatchRequestEntry {
  key: string
  text: string
  promptVersion?: string
}

const LEGACY_PROMPT_VERSION = '1.0'

const LLM_BATCH_ASYNC_ENABLED = process.env.LLM_BATCH_ASYNC_ENABLED === 'true'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REQUESTS_FILE = path.resolve(moduleDir, '../../pending_llm_requests/pending_llm_batch_requests.json')
const REQUESTS_FILE = process.env.LLM_BATCH_REQUESTS_FILE?.trim() || DEFAULT_REQUESTS_FILE
const REQUESTS_DIR = path.dirname(REQUESTS_FILE)
const SHARD_PREFIX = process.env.LLM_BATCH_REQUESTS_SHARD_PREFIX?.trim() || 'output'
const SHARD_REGEX = new RegExp(`^${SHARD_PREFIX}_(\\d+)\\.json$`)
const MAX_ENTRIES_PER_SHARD = Math.max(
  1,
  Number.parseInt(process.env.LLM_BATCH_REQUESTS_MAX_ENTRIES_PER_FILE ?? '', 10) || 10_000,
)

let loaded = false
const requestsByKey = new Map<string, LlmBatchRequestEntry>()
let writeTail: Promise<void> = Promise.resolve()

function normalizeKey(value: string): string {
  return value.trim()
}

function normalizeText(value: string): string {
  return value.trim()
}

function toSortedList(): LlmBatchRequestEntry[] {
  return Array.from(requestsByKey.values()).sort((a, b) => a.key.localeCompare(b.key))
}

function getShardFilePath(index: number): string {
  return path.join(REQUESTS_DIR, `${SHARD_PREFIX}_${index}.json`)
}

async function listShardFiles(): Promise<string[]> {
  try {
    const names = await fs.readdir(REQUESTS_DIR)
    return names
      .filter((name) => SHARD_REGEX.test(name))
      .sort((a, b) => {
        const aMatch = a.match(SHARD_REGEX)
        const bMatch = b.match(SHARD_REGEX)
        const aNum = aMatch ? Number.parseInt(aMatch[1], 10) : 0
        const bNum = bMatch ? Number.parseInt(bMatch[1], 10) : 0
        return aNum - bNum
      })
      .map((name) => path.join(REQUESTS_DIR, name))
  } catch {
    return []
  }
}

async function clearShardFiles(): Promise<void> {
  const files = await listShardFiles()
  await Promise.all(files.map(async (filePath) => {
    try {
      await fs.unlink(filePath)
    } catch {
      // Ignore missing/deleted race.
    }
  }))
}

async function saveToDiskSharded(): Promise<void> {
  const entries = toSortedList()
  await fs.mkdir(REQUESTS_DIR, { recursive: true })
  await clearShardFiles()

  let shardIndex = 0
  for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_SHARD) {
    const chunk = entries.slice(i, i + MAX_ENTRIES_PER_SHARD)
    const payload = JSON.stringify(chunk, null, 2)
    await fs.writeFile(getShardFilePath(shardIndex), payload, 'utf8')
    shardIndex += 1
  }

  // Keep backward compatibility by also writing a tiny pointer file.
  const manifest = {
    sharded: true,
    prefix: SHARD_PREFIX,
    shards: shardIndex,
    totalEntries: entries.length,
  }
  await fs.writeFile(REQUESTS_FILE, JSON.stringify(manifest, null, 2), 'utf8')
}

function queueWrite(): Promise<void> {
  writeTail = writeTail
    .then(async () => {
      await saveToDiskSharded()
    })
    .catch((error) => {
      console.error('[LLMBatchStore] Failed to save pending LLM batch requests:', error)
    })

  return writeTail
}

async function ensureLoaded(): Promise<void> {
  if (loaded) {
    return
  }
  loaded = true

  const shardFiles = await listShardFiles()
  if (shardFiles.length > 0) {
    for (const shardPath of shardFiles) {
      try {
        const raw = await fs.readFile(shardPath, 'utf8')
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) {
          continue
        }
        for (const entry of parsed) {
          const key = normalizeKey(String((entry as { key?: unknown }).key ?? ''))
          const text = normalizeText(String((entry as { text?: unknown }).text ?? ''))
          const promptVersion = normalizeText(
            String((entry as { promptVersion?: unknown }).promptVersion ?? LEGACY_PROMPT_VERSION),
          ) || LEGACY_PROMPT_VERSION
          if (!key || !text) {
            continue
          }
          requestsByKey.set(key, { key, text, promptVersion })
        }
      } catch {
        // Skip unreadable shard; continue loading others.
      }
    }
    return
  }

  try {
    const raw = await fs.readFile(REQUESTS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return
    }

    for (const entry of parsed) {
      const key = normalizeKey(String((entry as { key?: unknown }).key ?? ''))
      const text = normalizeText(String((entry as { text?: unknown }).text ?? ''))
      const promptVersion = normalizeText(
        String((entry as { promptVersion?: unknown }).promptVersion ?? LEGACY_PROMPT_VERSION),
      ) || LEGACY_PROMPT_VERSION
      if (!key || !text) {
        continue
      }
      requestsByKey.set(key, { key, text, promptVersion })
    }
  } catch {
    // If file is missing or invalid, start with an empty in-memory set.
  }
}

export function isLlmBatchAsyncEnabled(): boolean {
  return LLM_BATCH_ASYNC_ENABLED
}

export function getLlmBatchRequestsFilePath(): string {
  return path.join(REQUESTS_DIR, `${SHARD_PREFIX}_*.json`)
}

export async function replaceLlmBatchRequests(entries: LlmBatchRequestEntry[]): Promise<void> {
  await ensureLoaded()
  requestsByKey.clear()

  for (const entry of entries) {
    const key = normalizeKey(String(entry.key ?? ''))
    const text = normalizeText(String(entry.text ?? ''))
    const promptVersion = normalizeText(String(entry.promptVersion ?? LEGACY_PROMPT_VERSION))
      || LEGACY_PROMPT_VERSION
    if (!key || !text) {
      continue
    }
    requestsByKey.set(key, { key, text, promptVersion })
  }

  await queueWrite()
}

export async function queueLlmBatchRequest(entry: LlmBatchRequestEntry): Promise<void> {
  await ensureLoaded()

  const key = normalizeKey(String(entry.key ?? ''))
  const text = normalizeText(String(entry.text ?? ''))
  const promptVersion = normalizeText(String(entry.promptVersion ?? LEGACY_PROMPT_VERSION))
    || LEGACY_PROMPT_VERSION
  if (!key || !text) {
    return
  }

  requestsByKey.set(key, { key, text, promptVersion })
  await queueWrite()
}
