import { type DailyScoreBreakdownByDay } from './ClientSaveLoad'

interface UserNotesActivityGraphProps {
  dailyCounts: Record<string, number>
  dailyScoreBreakdownByDay?: DailyScoreBreakdownByDay
  daysToShow?: number
}

interface DayPoint {
  dayKey: string
  count: number
  jobsViewed: number
  commentsWritten: number
  userCreatedJobs: number
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShortDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map((part) => Number(part))
  if (!year || !month || !day) {
    return dayKey
  }
  return `${month}/${day}`
}

function buildRecentDayPoints(
  dailyCounts: Record<string, number>,
  dailyScoreBreakdownByDay: DailyScoreBreakdownByDay,
  daysToShow: number,
): DayPoint[] {
  const points: DayPoint[] = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)

  for (let offset = daysToShow - 1; offset >= 0; offset -= 1) {
    const date = new Date(base)
    date.setDate(base.getDate() - offset)
    const dayKey = getLocalDateKey(date)
    const breakdown = dailyScoreBreakdownByDay[dayKey]
    const rawCount = Number(dailyCounts[dayKey] ?? breakdown?.points ?? 0)
    const rawJobsViewed = Number(breakdown?.jobsViewed ?? 0)
    const rawCommentsWritten = Number(breakdown?.commentsWritten ?? 0)
    const rawUserCreatedJobs = Number(breakdown?.userCreatedJobs ?? 0)
    points.push({
      dayKey,
      count: Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0,
      jobsViewed: Number.isFinite(rawJobsViewed) ? Math.max(0, Math.floor(rawJobsViewed)) : 0,
      commentsWritten: Number.isFinite(rawCommentsWritten) ? Math.max(0, Math.floor(rawCommentsWritten)) : 0,
      userCreatedJobs: Number.isFinite(rawUserCreatedJobs) ? Math.max(0, Math.floor(rawUserCreatedJobs)) : 0,
    })
  }

  return points
}

export default function UserNotesActivityGraph({
  dailyCounts,
  dailyScoreBreakdownByDay = {},
  daysToShow = 14,
}: UserNotesActivityGraphProps) {
  const safeDaysToShow = Math.max(7, Math.min(30, Math.floor(daysToShow)))
  const points = buildRecentDayPoints(dailyCounts, dailyScoreBreakdownByDay, safeDaysToShow)
  const maxCount = Math.max(1, ...points.map((point) => point.count))
  const total = points.reduce((sum, point) => sum + point.count, 0)

  return (
    <section className="user-notes-activity" aria-label="User score earned per day">
      <div className="user-notes-activity__header">
        <h3 className="user-notes-activity__title">Daily score</h3>
        <span className="user-notes-activity__count">{total} pts in {safeDaysToShow}d</span>
      </div>

      <div className="user-notes-activity__bars" role="img" aria-label="Bar chart of score earned by day">
        {points.map((point) => {
          const heightPercent = point.count === 0 ? 6 : Math.max(8, (point.count / maxCount) * 100)
          const hoverSummary = `${point.dayKey}: ${point.count} pts, ${point.jobsViewed} jobs viewed, ${point.commentsWritten} comments, ${point.userCreatedJobs} user jobs created`
          return (
            <div key={point.dayKey} className="user-notes-activity__bucket">
              <div className="user-notes-activity__value">{point.count}</div>
              <div className="user-notes-activity__bar-wrap" title={hoverSummary}>
                <div className={`user-notes-activity__bar ${point.count > 0 ? 'user-notes-activity__bar--filled' : ''}`} style={{ height: `${heightPercent}%` }} />
                <div className="user-notes-activity__tooltip" role="tooltip">
                  <strong>{formatShortDayLabel(point.dayKey)}</strong>
                  <span>{point.count} pts</span>
                  <span>{point.jobsViewed} viewed</span>
                  <span>{point.commentsWritten} comments</span>
                  <span>{point.userCreatedJobs} created</span>
                </div>
              </div>
              <div className="user-notes-activity__label">{formatShortDayLabel(point.dayKey)}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
