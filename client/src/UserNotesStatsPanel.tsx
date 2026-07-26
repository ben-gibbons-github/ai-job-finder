import UserScoreDistributionGraph from './UserScoreDistributionGraph'
import UserNotesActivityGraph from './UserNotesActivityGraph'
import { type DailyScoreBreakdownByDay } from './ClientSaveLoad'

interface UserNotesStatsPanelProps {
  visibleJobsCount: number
  jobsWithUserNotesCount: number
  userNotesCoveragePercent: number
  userScoreValues: number[]
  dailyNoteAddsByDay: Record<string, number>
  dailyScoreBreakdownByDay: DailyScoreBreakdownByDay
}

export default function UserNotesStatsPanel({
  visibleJobsCount,
  jobsWithUserNotesCount,
  userNotesCoveragePercent,
  userScoreValues,
  dailyNoteAddsByDay,
  dailyScoreBreakdownByDay,
}: UserNotesStatsPanelProps) {
  return (
    <div className="user-notes-stats-panel">
      <div className="user-notes-stats-panel__row">
        <span className="user-notes-stats-panel__label">Items on this page</span>
        <strong>{visibleJobsCount}</strong>
      </div>

      <div className="user-notes-stats-panel__row">
        <span className="user-notes-stats-panel__label">With user notes</span>
        <strong>
          {userNotesCoveragePercent}% ({jobsWithUserNotesCount}/{visibleJobsCount})
        </strong>
      </div>

      <UserNotesActivityGraph
        dailyCounts={dailyNoteAddsByDay}
        dailyScoreBreakdownByDay={dailyScoreBreakdownByDay}
      />
      <UserScoreDistributionGraph scores={userScoreValues} />
    </div>
  )
}
