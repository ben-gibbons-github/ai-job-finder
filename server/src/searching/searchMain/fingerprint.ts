import { LOCATION_SCORING_VERSION } from '../searchDistance/SearchDistance.js'
import type { SearchPayload } from '../SearchInterfaces.js'

export function buildSearchFingerprint(payload: SearchPayload): string {
  const resumeText = typeof payload.resumeText === 'string' ? payload.resumeText : ''
  const resumeFingerprint = `${resumeText.length}|${resumeText.slice(0, 64)}|${resumeText.slice(-64)}`

  return JSON.stringify({
    locationScoringVersion: LOCATION_SCORING_VERSION,
    q: String(payload.query ?? '').trim().toLowerCase(),
    resume: resumeFingerprint,
    loc: String(payload.locationText ?? ''),
    promptVersionFilter: String(payload.promptVersionFilter ?? '').trim(),
    remote: payload.includeRemoteJobs !== false,
    ratingMode: payload.userRatingMode ?? 'none',
    weights: payload.scoreWeights ?? null,
    hiddenUrls: [...(payload.hiddenJobUrls ?? [])].sort(),
    hiddenCo: [...(payload.hiddenCompanies ?? [])].sort(),
    prioritizedImpactCategory: payload.prioritizedEmployerImpactCategory ?? null,
    ratings: payload.userRatings ?? null,
    ratingFilter: payload.userRatingFilter ?? null,
    addedJobs: [...(payload.addedJobs ?? [])]
      .sort((a, b) => String(a.source_url ?? '').localeCompare(String(b.source_url ?? '')))
      .map((j) => ({ url: j.source_url, score: j.userScore })),
  })
}
