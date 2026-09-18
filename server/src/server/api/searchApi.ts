import type { Express, Request, Response } from 'express'

import SearchMain, { type RankedJobWrapper, type ScoreWeights, type SearchPayload } from '../../searching/searchMain/SearchMain.js'
import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { consumeLeakyBucket, sweepIdleBuckets } from '../rateLimit/RateLimit.js'

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const HTTP_BUCKET_IDLE_MS = 30 * 60 * 1000
const HTTP_BUCKET_SWEEP_MS = 5 * 60 * 1000

interface RegisterSearchApiOptions {
  app: Express
  searchMain: SearchMain
  getJobs: () => ScrapedJob[]
  searchDebugEnabled: boolean
}

interface PublicSearchPayload {
  query?: string
  locationText?: string
  includeRemoteJobs?: boolean
  start?: number
  end?: number
  resumeText?: string
  scoreWeights?: ScoreWeights
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }

  return undefined
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  const text = firstString(value)?.trim().toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes') {
    return true
  }
  if (text === 'false' || text === '0' || text === 'no') {
    return false
  }

  return undefined
}

function parseInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  const text = firstString(value)
  if (text === undefined || text.trim().length === 0) {
    return undefined
  }

  const parsed = Number(text)
  return Number.isInteger(parsed) ? parsed : undefined
}

function parseScoreWeights(value: unknown): ScoreWeights | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const maybeWeights = value as Partial<Record<keyof ScoreWeights, unknown>>
  const weights: Partial<ScoreWeights> = {}

  for (const key of ['resume', 'impact', 'location', 'fresh', 'audit', 'qualityOfLife'] as const) {
    const weight = maybeWeights[key]
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      return undefined
    }
    weights[key] = weight
  }

  return weights as ScoreWeights
}

function clampPagination(rawStart: number | undefined, rawEnd: number | undefined): { start: number; end: number } {
  const start = Math.max(0, rawStart ?? 0)
  const requestedEnd = rawEnd ?? start + DEFAULT_PAGE_SIZE
  const end = Math.max(start, Math.min(requestedEnd, start + MAX_PAGE_SIZE))
  return { start, end }
}

function buildSearchPayload(input: Record<string, unknown>): PublicSearchPayload {
  const { start, end } = clampPagination(parseInteger(input.start), parseInteger(input.end))
  const payload: PublicSearchPayload = { start, end }
  const query = firstString(input.query)
  const locationText = firstString(input.locationText ?? input.location)
  const resumeText = firstString(input.resumeText)
  const includeRemoteJobs = parseBoolean(input.includeRemoteJobs)
  const scoreWeights = parseScoreWeights(input.scoreWeights)

  if (query !== undefined) {
    payload.query = query
  }
  if (locationText !== undefined) {
    payload.locationText = locationText
  }
  if (resumeText !== undefined) {
    payload.resumeText = resumeText
  }
  if (includeRemoteJobs !== undefined) {
    payload.includeRemoteJobs = includeRemoteJobs
  }
  if (scoreWeights !== undefined) {
    payload.scoreWeights = scoreWeights
  }

  return payload
}

function sanitizeAiPayload(wrapper: RankedJobWrapper): Partial<NonNullable<RankedJobWrapper['aiPayload']>> | undefined {
  const aiPayload = wrapper.aiPayload
  if (!aiPayload) {
    return undefined
  }

  const sanitized = {
    ...(aiPayload.audit.hasData ? { audit: aiPayload.audit } : {}),
    ...(aiPayload.impact.hasData ? { impact: aiPayload.impact } : {}),
    ...(aiPayload.qualityOfLife.hasData ? { qualityOfLife: aiPayload.qualityOfLife } : {}),
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeResult(wrapper: RankedJobWrapper): object {
  const job = wrapper.job
  const ai = sanitizeAiPayload(wrapper)

  return {
    job: {
      name: job.name,
      company_name: job.company_name,
      location: job.location,
      remote: job.remote,
      type: job.type,
      source: job.source,
      source_url: job.source_url,
      posted: job.posted,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_currency: job.salary_currency,
      salary_period: job.salary_period,
      salary_is_estimated: job.salary_is_estimated,
      tags: job.tags,
      job_type_primary_category: job.job_type_primary_category,
      job_type_categories: job.job_type_categories,
      job_type_classification_confidence: job.job_type_classification_confidence,
    },
    scores: wrapper.scores,
    totalScore: wrapper.totalScore,
    ...(ai ? { ai } : {}),
  }
}

function getClientBucketKey(req: Request): string {
  const flyClientIp = firstString(req.headers['fly-client-ip'])
  const forwardedFor = firstString(req.headers['x-forwarded-for'])?.split(',')[0]?.trim()
  const clientIp = flyClientIp || forwardedFor || req.ip || req.socket.remoteAddress || 'unknown'
  return `http:${clientIp}`
}

async function handleSearchRequest(
  req: Request,
  res: Response,
  searchMain: SearchMain,
  getJobs: () => ScrapedJob[],
  searchDebugEnabled: boolean,
): Promise<void> {
  if (!consumeLeakyBucket(getClientBucketKey(req), 'search')) {
    res.status(429).json({ error: 'Rate limit exceeded for search' })
    return
  }

  const source = req.method === 'GET' ? req.query : req.body
  const payload = buildSearchPayload(source && typeof source === 'object' ? source as Record<string, unknown> : {})

  try {
    const results = await searchMain.search(getJobs(), payload as SearchPayload, searchDebugEnabled)
    res.json({
      query: payload.query ?? '',
      location: payload.locationText ?? '',
      start: payload.start ?? 0,
      end: payload.end ?? DEFAULT_PAGE_SIZE,
      total: results.size,
      results: results.matched.map(sanitizeResult),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`HTTP search failed: ${message}`)
    res.status(500).json({ error: 'Search failed' })
  }
}

export function registerSearchApi(options: RegisterSearchApiOptions): void {
  const { app, searchMain, getJobs, searchDebugEnabled } = options

  app.get('/api/search', (req, res) => {
    void handleSearchRequest(req, res, searchMain, getJobs, searchDebugEnabled)
  })

  app.post('/api/search', (req, res) => {
    void handleSearchRequest(req, res, searchMain, getJobs, searchDebugEnabled)
  })

  const sweepTimer = setInterval(() => sweepIdleBuckets('http:', HTTP_BUCKET_IDLE_MS), HTTP_BUCKET_SWEEP_MS)
  sweepTimer.unref()
}