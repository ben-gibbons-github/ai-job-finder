import { createElement } from 'react'

export interface JobDistributionBucket {
  start: number
  end: number
  count: number
}

export interface JobDistributionMeta {
  aiCoverage: {
    auditPercent: number
    impactPercent: number
    qualityOfLifePercent: number
    geocodedPercent: number
    totalMatched: number
  }
  scoreDistribution: JobDistributionBucket[]
  debugInfo?: {
    cacheHit?: boolean
    userLat: number | null
    userLon: number | null
    locationText: string
    query: string
    totalJobsInput: number
    totalJobsVisible: number
    totalJobsMatched: number
    timings?: {
      filterMs: number
      queryMatchMs: number
      userGeocodeMs: number
      jobGeocodeMs: number
      jobGeoHadCoords: number
      jobGeoNewlyGeocoded: number
      jobGeoSkipped: number
      scoreTotalMs: number
      scoreResumeMs: number
      scoreLocationMs: number
      scoreFreshnessMs: number
      scoreAuditMs: number
      scoreQolMs: number
      scoreImpactMs: number
      scoreSortMs: number
      userRatingSortMs: number
      totalMs: number
    }
    exclusions?: {
      hiddenByUrl: number
      hiddenByCompany: number
      remoteJobsFiltered: number
      userRatingFiltered: number
      userRatingFilterMode: string
      queryMismatch: number
    }
  }
}

interface JobDistributionGraphProps {
  meta: JobDistributionMeta | null
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.0%'
  }
  return `${value.toFixed(1)}%`
}

export default function JobDistributionGraph({ meta }: JobDistributionGraphProps) {
  if (!meta) {
    return null
  }

  const buckets = Array.isArray(meta.scoreDistribution) ? meta.scoreDistribution : []
  const maxCount = Math.max(1, ...buckets.map((bucket) => Number(bucket.count) || 0))

  return createElement(
    'section',
    { className: 'job-distribution-graph', 'aria-label': 'Search coverage and score distribution' },
    createElement('h2', { className: 'job-distribution-graph__title' }, 'Search coverage and score distribution'),
    createElement(
      'div',
      { className: 'job-distribution-graph__coverage' },
      createElement(
        'span',
        { className: 'job-distribution-graph__coverage-item' },
        `Audit ${formatPercent(Number(meta.aiCoverage?.auditPercent ?? 0))}`,
      ),
      createElement(
        'span',
        { className: 'job-distribution-graph__coverage-item' },
        `Impact ${formatPercent(Number(meta.aiCoverage?.impactPercent ?? 0))}`,
      ),
      createElement(
        'span',
        { className: 'job-distribution-graph__coverage-item' },
        `QoL ${formatPercent(Number(meta.aiCoverage?.qualityOfLifePercent ?? 0))}`,
      ),
      createElement(
        'span',
        { className: 'job-distribution-graph__coverage-item' },
        `Geocoded ${formatPercent(Number(meta.aiCoverage?.geocodedPercent ?? 0))}`,
      ),
      createElement(
        'span',
        { className: 'job-distribution-graph__coverage-item' },
        `Matched ${Number(meta.aiCoverage?.totalMatched ?? 0)}`,
      ),
    ),
    createElement(
      'div',
      { className: 'job-distribution-graph__bars' },
      ...buckets.map((bucket) => {
        const count = Number(bucket.count) || 0
        const heightPercent = Math.max(3, (count / maxCount) * 100)

        return createElement(
          'div',
          {
            key: `${bucket.start}-${bucket.end}`,
            className: 'job-distribution-graph__bucket',
            'aria-label': `${bucket.start}-${bucket.end}: ${count} jobs`,
          },
          createElement('div', {
            className: 'job-distribution-graph__bar',
            style: { height: `${heightPercent}%` },
          }),
          createElement(
            'div',
            { className: 'job-distribution-graph__tooltip' },
            `${bucket.start}-${bucket.end}: ${count} jobs`,
          ),
        )
      }),
    ),
  )
}
