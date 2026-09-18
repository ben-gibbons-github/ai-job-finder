import type { ServerScoreAggregate } from './types.js'

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function countWords(text: string): number {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

export function summarizeScore(values: number[]): ServerScoreAggregate {
  const buckets: Array<{ label: string; start: number; end: number }> = [
    { label: '0-19', start: 0, end: 19 },
    { label: '20-39', start: 20, end: 39 },
    { label: '40-59', start: 40, end: 59 },
    { label: '60-79', start: 60, end: 79 },
    { label: '80-100', start: 80, end: 100 },
  ]
  const total = Math.max(1, values.length)

  const distribution = buckets.map((bucket) => {
    const count = values.filter((value) => value >= bucket.start && value <= bucket.end).length
    return {
      ...bucket,
      count,
      pct: Number(((count / total) * 100).toFixed(1)),
    }
  })

  const avg = values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
    : 0

  return { avg, distribution }
}

export function average(values: number[]): number {
  if (!values.length) return 0
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

export function clampScoreValue(value: number): number {
  return clampScore(value)
}

export function countTextWords(text: string): number {
  return countWords(text)
}
