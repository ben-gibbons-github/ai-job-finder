interface UserScoreDistributionGraphProps {
  scores: number[]
}

interface ScoreBucket {
  start: number
  end: number
  count: number
}

function buildBuckets(scores: number[]): ScoreBucket[] {
  const buckets: ScoreBucket[] = Array.from({ length: 10 }, (_, index) => ({
    start: index * 10,
    end: index === 9 ? 100 : index * 10 + 9,
    count: 0,
  }))

  for (const score of scores) {
    if (!Number.isFinite(score)) {
      continue
    }

    const normalized = Math.max(0, Math.min(100, score))
    const bucketIndex = normalized === 100 ? 9 : Math.floor(normalized / 10)
    buckets[bucketIndex].count += 1
  }

  return buckets
}

export default function UserScoreDistributionGraph({ scores }: UserScoreDistributionGraphProps) {
  const safeScores = scores.filter((score) => Number.isFinite(score))

  if (safeScores.length === 0) {
    return null
  }

  const buckets = buildBuckets(safeScores)
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count))

  return (
    <section className="user-score-distribution" aria-label="User score distribution">
      <div className="user-score-distribution__header">
        <h3 className="user-score-distribution__title">User score distribution</h3>
        <span className="user-score-distribution__count">{safeScores.length} scored</span>
      </div>

      <div className="user-score-distribution__bars" role="img" aria-label="Histogram of user scores">
        {buckets.map((bucket) => {
          const heightPercent = Math.max(6, (bucket.count / maxCount) * 100)
          const hasData = bucket.count > 0

          return (
            <div key={`${bucket.start}-${bucket.end}`} className="user-score-distribution__bucket">
              <div className={`user-score-distribution__bar ${hasData ? 'user-score-distribution__bar--filled' : ''}`} style={{ height: `${heightPercent}%` }} />
              <div className="user-score-distribution__label">{bucket.start}-{bucket.end}</div>
              <div className="user-score-distribution__value">{bucket.count}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}