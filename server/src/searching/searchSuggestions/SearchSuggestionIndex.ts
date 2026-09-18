import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js'
import { GENERIC_COMPANY_NAMES, STOP_WORDS, type SuggestionStats } from './model.js'
import { normalizeText, splitTitleWords, titleCaseWord } from './text.js'

export class SearchSuggestionIndex {
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
        const aWeighted = a.score - (a.wordCount * 10) - a.length
        const bWeighted = b.score - (b.wordCount * 10) - b.length
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
