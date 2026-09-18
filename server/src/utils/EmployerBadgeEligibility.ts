import type { ScrapedEmployer } from '../scraping/core/ScrapedEmployer.js'

export const IMPACT_BADGE_MIN_IMPACT_SCORE = 55
export const IMPACT_BADGE_MIN_AVERAGE_SCORE = 70

export interface EmployerBadgeEligibility {
  eligible: boolean
  reason: string
}

/** Employers must clear both an impact-score floor and an average-of-scores floor to unlock badges. */
export function getEmployerBadgeEligibility(employer: ScrapedEmployer | undefined | null): EmployerBadgeEligibility {
  if (!employer) {
    return { eligible: false, reason: 'No employer AI scores available' }
  }

  const impactScore = Number(employer.ai_impact_score ?? 0)
  const auditScore = Number(employer.ai_score ?? 0)
  const qolScore = Number(employer.employeeQualityOfLifeScore ?? 0)
  const averageScore = (impactScore + auditScore + qolScore) / 3
  const eligible = impactScore >= IMPACT_BADGE_MIN_IMPACT_SCORE
    && averageScore >= IMPACT_BADGE_MIN_AVERAGE_SCORE

  if (eligible) {
    return { eligible: true, reason: 'Eligible for employer impact badges' }
  }

  const failures: string[] = []
  if (impactScore < IMPACT_BADGE_MIN_IMPACT_SCORE) {
    failures.push(`Impact ${impactScore.toFixed(1)}/${IMPACT_BADGE_MIN_IMPACT_SCORE}`)
  }
  if (averageScore < IMPACT_BADGE_MIN_AVERAGE_SCORE) {
    failures.push(`Average ${averageScore.toFixed(1)}/${IMPACT_BADGE_MIN_AVERAGE_SCORE}`)
  }
  return { eligible: false, reason: `Badge bar not met: ${failures.join('; ')}` }
}

export function isEmployerEligibleForImpactBadge(employer: ScrapedEmployer | undefined | null): boolean {
  return getEmployerBadgeEligibility(employer).eligible
}
