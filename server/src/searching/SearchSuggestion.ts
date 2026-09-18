import type { ScrapedJob } from '../scraping/ScrapedJob.js'

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

const GENERIC_COMPANY_NAMES = new Set([
  'company confidential',
  'confidential',
  'jooble employer',
  'unknown',
  'unknown company',
  'unknown employer',
])

interface SuggestionStats {
  display: string
  score: number
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function titleCaseWord(value: string): string {
  if (!value) {
    return value
  }
  return value[0].toUpperCase() + value.slice(1).toLowerCase()
}

function splitTitleWords(title: string): string[] {
  const matches = title.match(/[A-Za-z0-9][A-Za-z0-9+#./'’-]*/g) ?? []
  return matches
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
}

class SearchSuggestionIndex {
  private suggestionByNormalized = new Map<string, SuggestionStats>()

  rebuildFromJobs(jobs: ScrapedJob[]): void {
    this.suggestionByNormalized.clear()
    const indexedCompanies = new Set<string>()

    for (const job of jobs) {
      const companyRaw = String(job?.company_name ?? '').trim().replace(/\s+/g, ' ')
      const companyNormalized = normalizeText(companyRaw)
      if (
        companyNormalized.length >= 2
        && !GENERIC_COMPANY_NAMES.has(companyNormalized)
        && !indexedCompanies.has(companyNormalized)
      ) {
        indexedCompanies.add(companyNormalized)
        this.upsert(companyNormalized, companyRaw, 8)
      }

      const titleRaw = String(job?.name ?? '').trim()
      if (!titleRaw) {
        continue
      }

      const phraseNormalized = normalizeText(titleRaw)
      if (phraseNormalized.length >= 2) {
        this.upsert(phraseNormalized, titleRaw.replace(/\s+/g, ' '), 6)
      }

      const words = splitTitleWords(titleRaw)
      for (const word of words) {
        const normalizedWord = normalizeText(word)
        if (normalizedWord.length < 2 || STOP_WORDS.has(normalizedWord)) {
          continue
        }

        this.upsert(normalizedWord, titleCaseWord(normalizedWord), 1)
      }
    }
  }

  suggest(query: string, limit = 8): string[] {
    const normalizedQuery = normalizeText(query)
    if (normalizedQuery.length < 2) {
      return []
    }

    const ranked = Array.from(this.suggestionByNormalized.entries())
      .map(([normalized, stats]) => {
        let matchBoost = 0
        if (normalized.startsWith(normalizedQuery)) {
          matchBoost = 1000
        } else if (normalized.includes(` ${normalizedQuery}`)) {
          matchBoost = 300
        } else {
          return null
        }

        return {
          suggestion: stats.display,
          score: stats.score + matchBoost,
          length: normalized.length,
          wordCount: normalized.split(/\s+/).filter(Boolean).length,
        }
      })
      .filter((entry): entry is { suggestion: string; score: number; length: number; wordCount: number } => entry !== null)
      .sort((a, b) => {
        let aWeighted = a.score - (a.wordCount * 10) - (a.length * 1)
        let bWeighted = b.score - (b.wordCount * 10) - (b.length * 1)
        if (aWeighted !== bWeighted) {
          return bWeighted - aWeighted
        }

        if (b.score !== a.score) {
          return b.score - a.score
        }
        if (a.wordCount !== b.wordCount) {
          return a.wordCount - b.wordCount
        }
        return a.length - b.length
      })

    return ranked.slice(0, Math.max(1, limit)).map((entry) => entry.suggestion)
  }

  getSuggestionCount(): number {
    return this.suggestionByNormalized.size
  }

  private upsert(normalized: string, display: string, scoreDelta: number): void {
    const existing = this.suggestionByNormalized.get(normalized)
    if (existing) {
      existing.score += scoreDelta
      return
    }

    this.suggestionByNormalized.set(normalized, {
      display,
      score: scoreDelta,
    })
  }
}

const searchSuggestionIndex = new SearchSuggestionIndex()

export function rebuildSearchSuggestions(jobs: ScrapedJob[]): void {
  searchSuggestionIndex.rebuildFromJobs(jobs)
}

export function getSearchSuggestions(query: string, limit = 8): string[] {
  return searchSuggestionIndex.suggest(query, limit)
}

export function getSearchSuggestionCount(): number {
  return searchSuggestionIndex.getSuggestionCount()
}
