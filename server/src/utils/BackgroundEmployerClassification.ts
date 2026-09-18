import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import { getCacheDb } from '../database/connection.js'
import { askGeminiNoSearch } from '../llms/AskLLM.js'
import { EMPLOYER_IMPACT_CATEGORY_LABELS } from '../searching/EmployerImpactCategory.js'
import { isEmployerEligibleForImpactBadge } from './EmployerBadgeEligibility.js'

const CLASSIFICATION_ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEV'

function getClassificationEnvValue(name: string): string | undefined {
  return process.env[`EMPLOYER_CLASSIFICATION_${CLASSIFICATION_ENVIRONMENT}_${name}`]
    ?? process.env[`EMPLOYER_CLASSIFICATION_${name}`]
}

function isClassificationEnvEnabled(name: string): boolean {
  const value = getClassificationEnvValue(name)
  return value === '1' || value === 'true'
}

const EMPLOYER_CLASSIFICATION_ENABLED = isClassificationEnvEnabled('ENABLED')
const CLASSIFICATION_MODEL = 'gemini-3.5-flash-lite'
const CLASSIFICATION_PROMPT_VERSION = '3.0'
const DEFAULT_MAX_EMPLOYERS = 0
const DEFAULT_REQUEST_DELAY_MS = 1000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_MAX_REQUEST_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 2_000

const CATEGORY_OPTIONS = Object.values(EMPLOYER_IMPACT_CATEGORY_LABELS)

type ClassificationCategory = (typeof CATEGORY_OPTIONS)[number]

interface EmployerClassification {
  primary_category: ClassificationCategory
  secondary_category: ClassificationCategory | null
  tertiary_category: ClassificationCategory | null
}

interface EmployerBucket {
  employerKey: string
  employerName: string
  impactSummary: string
  roleCount: number
  representativeJob: ScrapedJob
  existingClassification: string
}

function normalizeEmployerKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function getEmployerName(job: ScrapedJob): string {
  return String(job.scrapedEmployer?.name ?? job.company_name ?? '').trim()
}

function getImpactSummary(job: ScrapedJob): string {
  return String(job.scrapedEmployer?.ai_impact_summary ?? '').trim()
}

function getRequestDelayMs(): number {
  return Math.max(0, Number(getClassificationEnvValue('DELAY_MS') ?? DEFAULT_REQUEST_DELAY_MS))
}

function getMaxEmployers(): number {
  return Math.max(0, Number(getClassificationEnvValue('MAX_EMPLOYERS') ?? DEFAULT_MAX_EMPLOYERS))
}

function getRequestTimeoutMs(): number {
  return Math.max(1_000, Number(getClassificationEnvValue('TIMEOUT_MS') ?? DEFAULT_REQUEST_TIMEOUT_MS))
}

function getMaxRequestAttempts(): number {
  return Math.max(1, Number(getClassificationEnvValue('MAX_ATTEMPTS') ?? DEFAULT_MAX_REQUEST_ATTEMPTS))
}

function getRetryDelayMs(): number {
  const configuredDelay = Math.max(0, Number(getClassificationEnvValue('RETRY_DELAY_MS') ?? DEFAULT_RETRY_DELAY_MS))
  return configuredDelay
}

function ensureClassificationColumns(): void {
  const db = getCacheDb()
  const columns = db.prepare('PRAGMA table_info(scraped_employer_cache)').all() as Array<{ name?: string }>
  const existingColumns = new Set(columns.map((column) => String(column.name ?? '')))

  if (!existingColumns.has('classification_json')) {
    db.exec('ALTER TABLE scraped_employer_cache ADD COLUMN classification_json TEXT NOT NULL DEFAULT \'\'')
  }
  if (!existingColumns.has('classification_prompt_version')) {
    db.exec('ALTER TABLE scraped_employer_cache ADD COLUMN classification_prompt_version TEXT NOT NULL DEFAULT \'\'')
  }
  if (!existingColumns.has('classification_updated_at_ms')) {
    db.exec('ALTER TABLE scraped_employer_cache ADD COLUMN classification_updated_at_ms INTEGER NOT NULL DEFAULT 0')
  }
}

function loadExistingClassifications(): Map<string, { classificationJson: string; promptVersion: string }> {
  const db = getCacheDb()
  const rows = db.prepare(`
    SELECT employer_key, classification_json, classification_prompt_version
    FROM scraped_employer_cache
  `).all() as Array<{
    employer_key?: string
    classification_json?: string
    classification_prompt_version?: string
  }>

  return new Map(rows.map((row) => [
    normalizeEmployerKey(row.employer_key),
    {
      classificationJson: String(row.classification_json ?? '').trim(),
      promptVersion: String(row.classification_prompt_version ?? '').trim(),
    },
  ]))
}

function buildEmployerBuckets(jobs: ScrapedJob[]): EmployerBucket[] {
  const existingClassifications = loadExistingClassifications()
  const buckets = new Map<string, EmployerBucket>()

  for (const job of jobs) {
    const employerName = getEmployerName(job)
    const employerKey = normalizeEmployerKey(employerName)
    const impactSummary = getImpactSummary(job)
    if (!employerKey || !impactSummary || !isEmployerEligibleForImpactBadge(job.scrapedEmployer)) {
      continue
    }

    const existing = buckets.get(employerKey)
    if (existing) {
      existing.roleCount += 1
      continue
    }

    const cachedClassification = existingClassifications.get(employerKey)
    const hasCurrentClassification = cachedClassification?.promptVersion === CLASSIFICATION_PROMPT_VERSION
    buckets.set(employerKey, {
      employerKey,
      employerName,
      impactSummary,
      roleCount: 1,
      representativeJob: job,
      existingClassification: hasCurrentClassification ? cachedClassification.classificationJson : '',
    })
  }

  return Array.from(buckets.values()).sort(
    (left, right) => right.roleCount - left.roleCount || left.employerName.localeCompare(right.employerName),
  )
}

function buildClassificationPrompt(bucket: EmployerBucket): string {
  const categories = CATEGORY_OPTIONS.map((category) => `- ${category}`).join('\n')
  return `Classify this employer for Job Search for Good.

Categories:
${categories}

Return JSON with one required primary_category, plus optional secondary_category and tertiary_category only when useful. Every category must be distinct. Use null for optional categories that do not apply.

Input:
Company: ${bucket.employerName}
Mission: ${bucket.impactSummary.slice(0, 1000)}`
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  if (fenced) {
    return fenced
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('Gemini classification response did not contain a JSON object')
  }
  return text.slice(start, end + 1)
}

function parseClassification(text: string): EmployerClassification {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>
  const values = [
    parsed.primary_category,
    parsed.secondary_category,
    parsed.tertiary_category,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (!CATEGORY_OPTIONS.includes(parsed.primary_category as ClassificationCategory)) {
    throw new Error('Gemini returned an invalid primary category')
  }
  if (values.length !== new Set(values).size) {
    throw new Error('Gemini returned duplicate categories')
  }
  for (const value of values.slice(1)) {
    if (!CATEGORY_OPTIONS.includes(value as ClassificationCategory)) {
      throw new Error(`Gemini returned an invalid optional category: ${value}`)
    }
  }

  return {
    primary_category: parsed.primary_category as ClassificationCategory,
    secondary_category: parsed.secondary_category == null ? null : parsed.secondary_category as ClassificationCategory,
    tertiary_category: parsed.tertiary_category == null ? null : parsed.tertiary_category as ClassificationCategory,
  }
}

async function classifyEmployer(bucket: EmployerBucket, apiKey: string): Promise<EmployerClassification> {
  const [answer] = await askGeminiNoSearch([buildClassificationPrompt(bucket)], {
    promptVersion: CLASSIFICATION_PROMPT_VERSION,
  })

  if (!answer?.answer) {
    throw new Error('Gemini classification returned an empty answer')
  }

  return parseClassification(answer.answer)
}

function saveClassification(bucket: EmployerBucket, classification: EmployerClassification): void {
  const db = getCacheDb()
  db.prepare(`
    UPDATE scraped_employer_cache
    SET classification_json = ?,
        classification_prompt_version = ?,
        classification_updated_at_ms = ?
    WHERE employer_key = ?
  `).run(
    JSON.stringify(classification),
    CLASSIFICATION_PROMPT_VERSION,
    Date.now(),
    bucket.employerKey,
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function startBackgroundEmployerClassification(jobs: ScrapedJob[]): void {
  if (!EMPLOYER_CLASSIFICATION_ENABLED) {
    console.log(`[EmployerClassification] Skipping: EMPLOYER_CLASSIFICATION_${CLASSIFICATION_ENVIRONMENT}_ENABLED is not set.`)
    return
  }

  const apiKey = String(process.env.GEMINI_API_KEY ?? '').trim()
  if (!apiKey) {
    console.warn('[EmployerClassification] Skipping: GEMINI_API_KEY is not configured.')
    return
  }

  ensureClassificationColumns()
  const allBuckets = buildEmployerBuckets(jobs)
  const buckets = allBuckets.filter((bucket) => !bucket.existingClassification)
  const maxEmployers = getMaxEmployers()
  const queue = maxEmployers > 0 ? buckets.slice(0, maxEmployers) : buckets

  console.log(
    `[EmployerClassification] Queued ${queue.length} employers passing the impact badge bar ` +
    `(skipped existing classifications=${allBuckets.length - buckets.length}, ` +
    `skipped max-employer limit=${buckets.length - queue.length}, role-prioritized, environment=${CLASSIFICATION_ENVIRONMENT.toLowerCase()}, model=${CLASSIFICATION_MODEL}).`,
  )

  void (async () => {
    let completed = 0
    let failed = 0
    for (const bucket of queue) {
      try {
        const classification = await classifyEmployer(bucket, apiKey)
        saveClassification(bucket, classification)
        completed += 1
        console.log(
          `[EmployerClassification] Saved ${completed}/${queue.length}: ${bucket.employerName} ` +
          `(roles=${bucket.roleCount}, primary=${classification.primary_category})`,
        )
      } catch (error) {
        failed += 1
        console.error(
          `[EmployerClassification] Failed ${bucket.employerName} (roles=${bucket.roleCount}):`,
          error,
        )
      }

      const delayMs = getRequestDelayMs()
      if (delayMs > 0 && completed + failed < queue.length) {
        await sleep(delayMs)
      }
    }

    console.log(`[EmployerClassification] Complete: saved=${completed}, failed=${failed}, total=${queue.length}.`)
  })().catch((error) => {
    console.error('[EmployerClassification] Worker crashed:', error)
  })
}
