import type { ScrapedJob } from '../scraping/core/ScrapedJob.js'
import type { ScrapedEmployer } from '../scraping/core/ScrapedEmployer.js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { askGeminiWithSearch } from '../llms/AskLLM.js'
import {
  isLlmBatchAsyncEnabled,
  queueLlmBatchRequest,
} from '../llms/LlmBatchRequestStore.js'
import scrapedEmployerCache, { getOrCreateEmployer } from '../scraping/core/ScrapedEmployerCache.js'
import { clearActiveOperation, setActiveOperation } from '../server/ServerActivityTracker.js'

interface ParsedCompanyAiPayload {
  location_fallback: string
  audit: {
    companyQuality: number
    redFlags: number
    summary: string
  }
  impact: {
    impactScore: number
    impactSummary: string
  }
  qualityOfLife: {
    employeeQualityOfLifeScore: number
    employeeQualityOfLifeSummary: string
  }
}

export interface UnifiedCompanyAiResult {
  queuedForBatch: boolean
  error?: string
}

interface UnifiedScoreOffsets {
  audit: number
  impact: number
  qualityOfLife: number
}

const NO_SCORE_OFFSETS: UnifiedScoreOffsets = {
  audit: 0,
  impact: 0,
  qualityOfLife: 0,
}

export const UNIFIED_COMPANY_AI_SCORE_OFFSETS_BY_PROMPT_VERSION: Record<string, UnifiedScoreOffsets> = {
  '7.0': {
    audit: 2,
    impact: 5,
    qualityOfLife: 10,
  },
}

const inFlightByEmployer = new Map<string, Promise<UnifiedCompanyAiResult>>()
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const COMPANY_AI_PROMPT_PATHS = [
  path.resolve(moduleDir, '../../prompts/unified_company_ai_prompt.txt'),
  path.resolve(moduleDir, '../prompts/unified_company_ai_prompt.txt'),
]

function loadCompanyAiPromptTemplate(): string {
  for (const promptPath of COMPANY_AI_PROMPT_PATHS) {
    try {
      return readFileSync(promptPath, 'utf8')
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined
      if (code !== 'ENOENT') {
        throw error
      }
    }
  }

  throw new Error(`Company AI prompt template not found. Checked: ${COMPANY_AI_PROMPT_PATHS.join(', ')}`)
}

const COMPANY_AI_PROMPT_TEMPLATE = loadCompanyAiPromptTemplate()
const COMPANY_AI_SYSTEM_INSTRUCTION =
  'You are a strict due-diligence and scoring assistant. Output JSON only.'
export const UNIFIED_COMPANY_AI_PROMPT_VERSION = '7.0'
const REQUIRED_PROMPT_PLACEHOLDERS = ['{{COMPANY}}', '{{TITLE}}', '{{LOCATION}}', '{{SOURCE_URL}}', '{{SOURCE}}']
const OPTIONAL_PROMPT_PLACEHOLDERS = new Set(['{{TITLE}}', '{{DESCRIPTION}}'])

function logCompanyAiBlock(label: string, value: string): void {
  console.log(`[SearchCompanyAiUnified] ===== ${label} =====`)
  console.log(value)
  console.log(`[SearchCompanyAiUnified] ===== END ${label} =====`)
}

function listMissingRequiredPromptPlaceholders(template: string): string[] {
  return REQUIRED_PROMPT_PLACEHOLDERS.filter(
    (placeholder) => !OPTIONAL_PROMPT_PLACEHOLDERS.has(placeholder) && !template.includes(placeholder),
  )
}

function describeJobForLogs(job: ScrapedJob): string {
  return [
    `company=${String(job.company_name ?? '').trim() || '?'}`,
    `title=${String(job.name ?? '').trim() || '?'}`,
    `source=${String(job.source ?? '').trim() || '?'}`,
    `url=${String(job.source_url ?? '').trim() || '?'}`,
  ].join(', ')
}

function clampToPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeCompanyName(value: string | undefined | null): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizePromptVersion(value: unknown): string {
  return String(value ?? '').trim() || '1.0'
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function getUnifiedScoreOffsets(promptVersion: unknown): UnifiedScoreOffsets {
  const normalized = normalizePromptVersion(promptVersion)
  return UNIFIED_COMPANY_AI_SCORE_OFFSETS_BY_PROMPT_VERSION[normalized] ?? NO_SCORE_OFFSETS
}

export function getEffectiveUnifiedCompanyAiScores(employer?: ScrapedEmployer | null): {
  auditScore: number
  redFlagScore: number
  impactScore: number
  qualityOfLifeScore: number
  promptVersion: string
  offsets: UnifiedScoreOffsets
} {
  const promptVersion = normalizePromptVersion(employer?.promptVersion)
  const offsets = getUnifiedScoreOffsets(promptVersion)

  const auditScore = clampToPercent(toFiniteNumber(employer?.ai_score) + offsets.audit)
  const redFlagScore = clampToPercent(toFiniteNumber(employer?.ai_red_flag_score))
  const impactScore = clampToPercent(toFiniteNumber(employer?.ai_impact_score) + offsets.impact)
  const qualityOfLifeScore = clampToPercent(
    toFiniteNumber(employer?.employeeQualityOfLifeScore) + offsets.qualityOfLife,
  )

  return {
    auditScore,
    redFlagScore,
    impactScore,
    qualityOfLifeScore,
    promptVersion,
    offsets,
  }
}

function parseScore(value: unknown): number {
  if (typeof value === 'number') {
    return clampToPercent(value)
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/%/g, '').trim())
    return clampToPercent(parsed)
  }
  return 0
}

function getEmployerKey(job: ScrapedJob): string {
  const fromEmployer = normalizeCompanyName(job.scrapedEmployer?.name)
  if (fromEmployer.length > 0) {
    return fromEmployer
  }
  return normalizeCompanyName(job.company_name)
}

function hasAuditData(job: ScrapedJob): boolean {
  const employer = getOrCreateEmployer(job)
  return employer.ai_score > 0
    || employer.ai_red_flag_score > 0
    || String(employer.ai_summary ?? '').trim().length > 0
    || String(employer.ai_red_flag_summary ?? '').trim().length > 0
}

function hasImpactData(job: ScrapedJob): boolean {
  const employer = getOrCreateEmployer(job)
  return employer.ai_impact_score > 0
    || String(employer.ai_impact_summary ?? '').trim().length > 0
}

function hasQualityOfLifeData(job: ScrapedJob): boolean {
  const employer = getOrCreateEmployer(job)
  return employer.employeeQualityOfLifeScore > 0
    || String(employer.employeeQualityOfLifeSummary ?? '').trim().length > 0
}

export function hasAllUnifiedCompanyAiData(job: ScrapedJob): boolean {
  return hasAuditData(job) && hasImpactData(job) && hasQualityOfLifeData(job)
}

export function getLlmJobBatchKey(job: ScrapedJob): string {
  const company = normalizeCompanyName(job.company_name)
  const source = String(job.source ?? '').trim().toLowerCase()
  const sourceUrl = String(job.source_url ?? '').trim().toLowerCase()
  const title = String(job.name ?? '').trim().toLowerCase()
  const location = String(job.location ?? '').trim().toLowerCase()

  const seed = [source, sourceUrl, company, title, location].join('::')
  const digest = createHash('sha1').update(seed).digest('hex').slice(0, 20)
  return `job_${digest}`
}

export function buildUnifiedCompanyAiPrompt(job: ScrapedJob): string {
  const replacements: Record<string, string> = {
    COMPANY: String(job.company_name),
    TITLE: String(job.name),
    LOCATION: String(job.location),
    SOURCE_URL: String(job.source_url),
    SOURCE: String(job.source),
    DESCRIPTION: String(job.description),
  }

  return Object.entries(replacements).reduce((prompt, [key, value]) => {
    const placeholder = `{{${key}}}`
    if (!prompt.includes(placeholder)) {
      if (OPTIONAL_PROMPT_PLACEHOLDERS.has(placeholder)) {
        return prompt
      }
      throw new Error(`Company AI prompt template is missing placeholder: ${placeholder}`)
    }
    return prompt.replace(placeholder, value)
  }, COMPANY_AI_PROMPT_TEMPLATE)
}

function extractBalancedJsonObjects(text: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      if (depth === 0) {
        start = i
      }
      depth += 1
      continue
    }

    if (ch === '}') {
      if (depth > 0) {
        depth -= 1
        if (depth === 0 && start !== -1) {
          blocks.push(text.slice(start, i + 1))
          start = -1
        }
      }
    }
  }

  return blocks
}

function parseUnifiedPayload(input: unknown): ParsedCompanyAiPayload | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const value = input as Record<string, unknown>

  const hasAuditSection = typeof value.audit === 'object' && value.audit !== null
  const hasImpactSection = typeof value.impact === 'object' && value.impact !== null
  const hasQualityOfLifeSection =
    (typeof value.qualityOfLife === 'object' && value.qualityOfLife !== null)
    || (typeof value.quality_of_life === 'object' && value.quality_of_life !== null)
    || (typeof value.qol === 'object' && value.qol !== null)

  // Reject partial objects so we do not cache incomplete AI reports.
  if (!hasAuditSection || !hasImpactSection || !hasQualityOfLifeSection) {
    return null
  }

  const auditRaw = (value.audit ?? {}) as Record<string, unknown>
  const impactRaw = (value.impact ?? {}) as Record<string, unknown>
  const qualityRaw = (value.qualityOfLife ?? value.quality_of_life ?? value.qol ?? {}) as Record<string, unknown>
  const location_fallback = String(value.location_fallback ?? value.locationFallback ?? '').trim()

  const audit = {
    companyQuality: parseScore(
      auditRaw.companyQuality
      ?? value.companyQuality
      ?? auditRaw.jobQuality
      ?? value.jobQuality,
    ),
    redFlags: parseScore(auditRaw.redFlags ?? value.redFlags),
    summary: String(auditRaw.summary ?? value.auditSummary ?? value.summary ?? '').trim(),
  }

  const impact = {
    impactScore: parseScore(impactRaw.impactScore ?? impactRaw.score ?? value.impactScore),
    impactSummary: String(impactRaw.impactSummary ?? impactRaw.summary ?? value.impactSummary ?? '').trim(),
  }

  const qualityOfLife = {
    employeeQualityOfLifeScore: parseScore(
      qualityRaw.employeeQualityOfLifeScore
      ?? qualityRaw.score
      ?? value.employeeQualityOfLifeScore,
    ),
    employeeQualityOfLifeSummary: String(
      qualityRaw.employeeQualityOfLifeSummary
      ?? qualityRaw.summary
      ?? value.employeeQualityOfLifeSummary
      ?? '',
    ).trim(),
  }

  const hasRequiredSummaries =
    audit.summary.length > 0
    && impact.impactSummary.length > 0
    && qualityOfLife.employeeQualityOfLifeSummary.length > 0

  if (!hasRequiredSummaries) {
    return null
  }

  return { location_fallback, audit, impact, qualityOfLife }
}

export function parseUnifiedCompanyAiResponse(responseText: string): ParsedCompanyAiPayload | null {
  const candidates: string[] = []

  const fencedMatches = responseText.match(/```(?:json)?\s*([\s\S]*?)```/gi)
  if (fencedMatches) {
    for (const match of fencedMatches) {
      const cleaned = match.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
      if (cleaned.length > 0) {
        candidates.push(cleaned)
      }
    }
  }

  candidates.push(...extractBalancedJsonObjects(responseText))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const normalized = parseUnifiedPayload(parsed)
      if (normalized) {
        return normalized
      }
    } catch {
      // Try next candidate.
    }
  }

  return null
}

function buildJobAiCacheKey(job: ScrapedJob): string {
  const sourceUrl = String(job.source_url ?? '').trim()
  const company = String(job.company_name ?? '').trim().toLowerCase()
  const title = String(job.name ?? '').trim().toLowerCase()
  const location = String(job.location ?? '').trim().toLowerCase()

  if (sourceUrl) {
    return `${sourceUrl}::${company}::${title}::${location}`
  }
  return `${title}::${company}::${location}`
}

function hydrateAuditFields(job: ScrapedJob): void {
  const employer = getOrCreateEmployer(job)
  const effectiveScores = getEffectiveUnifiedCompanyAiScores(employer)
  const finalAuditScore = clampToPercent((effectiveScores.auditScore + (100 - effectiveScores.redFlagScore)) / 2)
  const prevAuditNumber = job.audit_number
  const prevAuditText = job.audit_text
  job.audit_number = finalAuditScore
  job.audit_text = JSON.stringify({
    companyQuality: effectiveScores.auditScore,
    redFlags: effectiveScores.redFlagScore,
    finalAuditScore,
    summary: employer.ai_summary,
    promptVersion: effectiveScores.promptVersion,
    scoreOffsets: effectiveScores.offsets,
  })

  console.log(
    `[SearchCompanyAiUnified] hydrateAuditFields key=${buildJobAiCacheKey(job)} ` +
    `audit_number ${prevAuditNumber} -> ${job.audit_number} ` +
    `audit_text ${String(prevAuditText ?? '').slice(0, 120)} -> ${String(job.audit_text ?? '').slice(0, 120)}`,
  )
}

function applyUnifiedPayload(
  job: ScrapedJob,
  payload: ParsedCompanyAiPayload,
  prompt: string,
): void {
  const employer = getOrCreateEmployer(job)
  const key = buildJobAiCacheKey(job)

  console.log(
    `[SearchCompanyAiUnified] applyUnifiedPayload key=${key} employer=${String(employer.name ?? '?')} ` +
    `before: ai_summary=${String(employer.ai_summary ?? '').slice(0, 80)} impact=${String(employer.ai_impact_summary ?? '').slice(0, 80)} qol=${String(employer.employeeQualityOfLifeSummary ?? '').slice(0, 80)}`,
  )

  employer.ai_score = payload.audit.companyQuality
  employer.ai_red_flag_score = payload.audit.redFlags
  employer.ai_summary = payload.audit.summary
  employer.ai_red_flag_summary = payload.audit.summary

  employer.ai_impact_score = payload.impact.impactScore
  employer.ai_impact_summary = payload.impact.impactSummary

  employer.employeeQualityOfLifeScore = payload.qualityOfLife.employeeQualityOfLifeScore
  employer.employeeQualityOfLifeSummary = payload.qualityOfLife.employeeQualityOfLifeSummary
  employer.location_fallback = payload.location_fallback
  employer.promptVersion = UNIFIED_COMPANY_AI_PROMPT_VERSION
  employer.aiPrompt = prompt

  console.log(
    `[SearchCompanyAiUnified] applyUnifiedPayload key=${key} updated fields: ` +
    `ai_score=${employer.ai_score} ai_red_flag_score=${employer.ai_red_flag_score} ` +
    `ai_summary=${String(employer.ai_summary ?? '').slice(0, 120)} ` +
    `ai_impact_summary=${String(employer.ai_impact_summary ?? '').slice(0, 120)} ` +
    `employeeQualityOfLifeSummary=${String(employer.employeeQualityOfLifeSummary ?? '').slice(0, 120)} ` +
    `location_fallback=${String(employer.location_fallback ?? '').slice(0, 120)} promptVersion=${employer.promptVersion}`,
  )

  scrapedEmployerCache.setCachedEmployer(employer)
  hydrateAuditFields(job)
}

export async function runUnifiedCompanyAiAsync(job: ScrapedJob, shouldLog = false, forceRefresh = false): Promise<UnifiedCompanyAiResult> {
  const employer = getOrCreateEmployer(job)

  if (shouldLog) {
    console.log(
      `[SearchCompanyAiUnified] Enter runUnifiedCompanyAiAsync(forceRefresh=${forceRefresh}) for ${describeJobForLogs(job)}`,
    )
  }

  if (!forceRefresh && hasAllUnifiedCompanyAiData(job)) {
    if (shouldLog) {
      console.log(
        `[SearchCompanyAiUnified] Skip unified call: all data already present for employer=${String(employer.name ?? '?')}`,
      )
    }
    hydrateAuditFields(job)
    return { queuedForBatch: false }
  }

  const employerKey = getEmployerKey(job)
  const existing = inFlightByEmployer.get(employerKey)
  if (existing) {
    if (shouldLog) {
      console.log(
        `[SearchCompanyAiUnified] Reusing in-flight unified request for employerKey=${employerKey} (${describeJobForLogs(job)})`,
      )
    }
    return existing
  }

  const runPromise = (async (): Promise<UnifiedCompanyAiResult> => {
    let prompt = ''
    try {
      prompt = buildUnifiedCompanyAiPrompt(job)
    } catch (error) {
      const missing = listMissingRequiredPromptPlaceholders(COMPANY_AI_PROMPT_TEMPLATE)
      const details = missing.length > 0
        ? `missing template placeholders: ${missing.join(', ')}`
        : 'template includes required placeholders; replacement likely failed unexpectedly'
      const message = `[SearchCompanyAiUnified] Prompt build failed for ${describeJobForLogs(job)} (${details})`
      if (shouldLog) {
        console.error(message, error)
      }
      return {
        queuedForBatch: false,
        error: `${String(error)} | ${details}`,
      }
    }

    if (isLlmBatchAsyncEnabled()) {
      if (shouldLog) {
        console.log(`[SearchCompanyAiUnified] Batch mode: queueing ${employer.name} | ${job.name}`)
        logCompanyAiBlock('SYSTEM INSTRUCTION', COMPANY_AI_SYSTEM_INSTRUCTION)
        logCompanyAiBlock('USER PROMPT', prompt)
      }
      await queueLlmBatchRequest({
        key: getLlmJobBatchKey(job),
        text: prompt,
        promptVersion: UNIFIED_COMPANY_AI_PROMPT_VERSION,
      })
      return { queuedForBatch: true }
    }

    const label = `gemini:company-ai ${String(employer.name ?? '?')} | ${String(job.name ?? '?')}`
    try {
      if (shouldLog) {
        console.log(`[SearchCompanyAiUnified] Starting AI call: ${employer.name} | ${job.name}`)
        logCompanyAiBlock('SYSTEM INSTRUCTION', COMPANY_AI_SYSTEM_INSTRUCTION)
        logCompanyAiBlock('USER PROMPT', prompt)
      }

      setActiveOperation(label)
      const [result] = await askGeminiWithSearch([prompt], {
        systemInstruction: COMPANY_AI_SYSTEM_INSTRUCTION,
        promptVersion: UNIFIED_COMPANY_AI_PROMPT_VERSION,
      })

      if (shouldLog) {
        logCompanyAiBlock('RAW AI RESPONSE', result.answer)
      }

      const parsed = parseUnifiedCompanyAiResponse(result.answer)
      if (!parsed) {
        if (shouldLog) {
          console.error(
            `[SearchCompanyAiUnified] Parse failed for ${describeJobForLogs(job)}. responseLength=${result.answer.length}`,
          )
        }
        throw new Error(
          IS_PRODUCTION
            ? `Failed to parse unified company AI response for employer: ${employer.name}`
            : `Failed to parse unified company AI response for employer: ${employer.name}\n${result.answer}`,
        )
      }

      applyUnifiedPayload(job, parsed, prompt)
      if (shouldLog) {
        logCompanyAiBlock('PARSED AI RESULT', JSON.stringify(parsed, null, 2))
        console.log(`[SearchCompanyAiUnified] Saved AI stats for employer: ${employer.name}`)
      }
      return { queuedForBatch: false }
    } catch (error) {
      if (shouldLog) {
        console.error(`[SearchCompanyAiUnified] Unified AI scoring failed for ${job.company_name}:`, error)
      }
      return {
        queuedForBatch: false,
        error: String(error),
      }
    } finally {
      clearActiveOperation(label)
    }
  })()

  inFlightByEmployer.set(employerKey, runPromise)

  try {
    return await runPromise
  } finally {
    inFlightByEmployer.delete(employerKey)
  }
}

export function getCurrentCompanyAiScores(job: ScrapedJob): {
  auditScore: number
  auditText: string
  impactScore: number
  impactSummary: string
  qualityOfLifeScore: number
  qualityOfLifeSummary: string
} {
  const employer = getOrCreateEmployer(job)
  const effectiveScores = getEffectiveUnifiedCompanyAiScores(employer)
  hydrateAuditFields(job)
  return {
    auditScore: clampToPercent(job.audit_number),
    auditText: String(job.audit_text ?? ''),
    impactScore: effectiveScores.impactScore,
    impactSummary: String(employer.ai_impact_summary ?? ''),
    qualityOfLifeScore: effectiveScores.qualityOfLifeScore,
    qualityOfLifeSummary: String(employer.employeeQualityOfLifeSummary ?? ''),
  }
}
