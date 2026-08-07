/**
 * scoreColors.ts
 *
 * Universal score-to-colour mapping shared by JobTile and JobTileStatsPopover.
 * Returns inline-style properties so both components stay visually identical
 * without needing to synchronise CSS class names.
 *
 * Usage:
 *   const colors = getScoreColors(0.85)
 *   <div style={colors}>…</div>
 *
 * @param score  0–1 fraction (e.g. 0.85 = 85%). Values > 1 are clamped to the
 *               top tier. Pass undefined/null/NaN to get the "no data" grey.
 */
export interface ScoreColors {
  background: string
  borderColor: string
  color: string
  boxShadow?: string
}

export function getScoreColors(score: number | undefined | null): ScoreColors {
  if (score == null || !Number.isFinite(score)) {
    return { background: 'rgba(244,244,245,0.8)', borderColor: '#d4d4d8', color: '#a1a1aa' }
  }

  // ≥ 100% — soft mint, bright teal border with glow
  if (score >= 1.0) {
    return {
      background:  'rgba(204,251,241,0.8)',
      borderColor: '#10b981',
      color:        '#065f46',
      boxShadow:   '0 0 6px rgba(16,185,129,0.2)',
    }
  }
  // 80–100% — soft blue, teal-green border
  if (score >= 0.8) {
    return { background: 'rgba(219,234,254,0.8)', borderColor: '#34d399', color: '#1e40af' }
  }
  // 60–80% — lighter blue, teal-green border
  if (score >= 0.6) {
    return { background: 'rgba(239,246,255,0.8)', borderColor: '#34d399', color: '#2563eb' }
  }
  // 40–60% — soft blue, soft blue border
  if (score >= 0.4) {
    return { background: 'rgba(239,246,255,0.8)', borderColor: '#93c5fd', color: '#3b82f6' }
  }
  // 20–40% — grey, soft blue border
  if (score >= 0.2) {
    return { background: 'rgba(244,244,245,0.8)', borderColor: '#93c5fd', color: '#6b7280' }
  }
  // < 20% — grey, grey border
  return { background: 'rgba(244,244,245,0.8)', borderColor: '#d4d4d8', color: '#a1a1aa' }
}
