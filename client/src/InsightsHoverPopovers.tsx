import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import JobDistributionGraph, { type JobDistributionMeta } from './JobDistributionGraph'
import { usePinnedHoverPopover, type InsightsPopoverKey } from './usePinnedHoverPopover'
import ActionsMenu from './ActionsMenu'
import { type AddedJobDraft, type CompanyTagColor, type DailyScoreBreakdownByDay, type UserRatingMode } from './ClientSaveLoad'
import UserNotesStatsPanel from './UserNotesStatsPanel'
import TagCloudPanel, { type TagCloudEntry } from './TagCloudPanel'

interface InsightsHoverPopoversProps {
  searchMeta: JobDistributionMeta | null
  onOpenAiCorpus: () => void
  onRunAuditAllInSearch?: () => void
  onAddJob: (draft: AddedJobDraft) => void
  onExportAllData: () => void
  onExportPageAsCsv: () => void
  onImportAllData: (xmlText: string) => void | Promise<void>
  userRatingMode: UserRatingMode
  onUserRatingModeChange: (value: UserRatingMode) => void
  hideApplied: boolean
  onHideAppliedChange: (value: boolean) => void
  hideTagColors: CompanyTagColor[]
  onHideTagColorsChange: (colors: CompanyTagColor[]) => void
  visibleJobsCount: number
  jobsWithUserNotesCount: number
  userNotesCoveragePercent: number
  userScoreValues: number[]
  dailyNoteAddsByDay: Record<string, number>
  dailyScoreBreakdownByDay: DailyScoreBreakdownByDay
  tagCloud: TagCloudEntry[]
  onTagCloudWordClick: (word: string) => void
  isEnabled: boolean
  hasSearched: boolean
}

export default function InsightsHoverPopovers({
  searchMeta,
  onOpenAiCorpus,
  onRunAuditAllInSearch,
  onAddJob,
  onExportAllData,
  onExportPageAsCsv,
  onImportAllData,
  userRatingMode,
  onUserRatingModeChange,
  hideApplied,
  onHideAppliedChange,
  hideTagColors,
  onHideTagColorsChange,
  visibleJobsCount,
  jobsWithUserNotesCount,
  userNotesCoveragePercent,
  userScoreValues,
  dailyNoteAddsByDay,
  dailyScoreBreakdownByDay,
  tagCloud,
  onTagCloudWordClick,
  isEnabled,
  hasSearched,
}: InsightsHoverPopoversProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [panelShiftX, setPanelShiftX] = useState<Record<InsightsPopoverKey, number>>({
    tagCloud: 0,
    distribution: 0,
    actions: 0,
    userNotes: 0,
  })
  const tagCloudPanelRef = useRef<HTMLDivElement | null>(null)
  const distributionPanelRef = useRef<HTMLDivElement | null>(null)
  const actionsPanelRef = useRef<HTMLDivElement | null>(null)
  const userNotesPanelRef = useRef<HTMLDivElement | null>(null)
  const {
    containerRef,
    visiblePopover,
    setHoverPopover,
    clearHoverPopover,
  } = usePinnedHoverPopover()

  const clampPanelToViewport = useCallback((key: InsightsPopoverKey) => {
    const panel =
      key === 'tagCloud'
        ? tagCloudPanelRef.current
        : key === 'distribution'
        ? distributionPanelRef.current
        : key === 'actions'
            ? actionsPanelRef.current
            : userNotesPanelRef.current

    if (!panel) {
      return
    }

    const viewportPadding = 8
    const rect = panel.getBoundingClientRect()

    setPanelShiftX((prev) => {
      const currentShift = prev[key]
      const baseLeft = rect.left - currentShift
      const baseRight = rect.right - currentShift
      const maxRight = window.innerWidth - viewportPadding
      const minLeft = viewportPadding

      let nextShift = currentShift

      if (baseRight + nextShift > maxRight) {
        nextShift = maxRight - baseRight
      }

      if (baseLeft + nextShift < minLeft) {
        nextShift = minLeft - baseLeft
      }

      const rounded = Math.round(nextShift)
      if (rounded === currentShift) {
        return prev
      }

      return {
        ...prev,
        [key]: rounded,
      }
    })
  }, [])

  useEffect(() => {
    if (!isExpanded || !visiblePopover) {
      return
    }

    const runClamp = () => {
      clampPanelToViewport(visiblePopover)
    }

    const frame = window.requestAnimationFrame(runClamp)
    window.addEventListener('resize', runClamp)
    window.addEventListener('scroll', runClamp, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', runClamp)
      window.removeEventListener('scroll', runClamp, true)
    }
  }, [clampPanelToViewport, isExpanded, visiblePopover])

  const panelStyle = (key: InsightsPopoverKey): CSSProperties => {
    const style: CSSProperties = {}
    ;(style as Record<string, string>)['--panel-shift-x'] = `${panelShiftX[key]}px`
    return style
  }

  return (
    <div className="advanced-options">
      <div className="advanced-options__header">
        <button
          type="button"
          className={`advanced-options__toggle ${hasSearched ? 'advanced-options__toggle--searched' : ''}`.trim()}
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
        >
          <span>Advanced options</span>
          <span className={`advanced-options__chevron ${isExpanded ? 'advanced-options__chevron--open' : ''}`}>▾</span>
        </button>
      </div>

      {isExpanded && (
        <div
          className={`app-insights-actions ${isEnabled ? '' : 'app-insights-actions--disabled'}`.trim()}
          aria-label="Insights controls"
          ref={containerRef}
          onMouseLeave={clearHoverPopover}
        >
      <div
        className="app-insights-actions__item"
        onMouseEnter={() => setHoverPopover('tagCloud')}
      >
        <button
          type="button"
          className={`app-insights-actions__button ${visiblePopover === 'tagCloud' ? 'app-insights-actions__button--active' : ''}`}
        >
          Tag cloud
        </button>
        <div
          className={`app-insights-hover-panel app-insights-hover-panel--tag-cloud ${visiblePopover === 'tagCloud' ? 'app-insights-hover-panel--open' : ''}`}
          ref={tagCloudPanelRef}
          style={panelStyle('tagCloud')}
          onMouseEnter={() => setHoverPopover('tagCloud')}
        >
          <TagCloudPanel entries={tagCloud} onWordClick={onTagCloudWordClick} />
        </div>
      </div>

      <div
        className="app-insights-actions__item"
        onMouseEnter={() => {
          if (isEnabled) {
            setHoverPopover('distribution')
          }
        }}
      >
        <button
          type="button"
          className={`app-insights-actions__button ${visiblePopover === 'distribution' ? 'app-insights-actions__button--active' : ''}`}
        >
          Score distribution
        </button>
        <div
          className={`app-insights-hover-panel ${visiblePopover === 'distribution' ? 'app-insights-hover-panel--open' : ''}`}
          ref={distributionPanelRef}
          style={panelStyle('distribution')}
          onMouseEnter={() => setHoverPopover('distribution')}
        >
          <JobDistributionGraph meta={searchMeta} />
        </div>
      </div>

      <ActionsMenu
        visiblePopover={visiblePopover}
        setHoverPopover={setHoverPopover}
        panelRef={actionsPanelRef}
        panelStyle={panelStyle('actions')}
        onOpenAiCorpus={onOpenAiCorpus}
        onRunAuditAllInSearch={onRunAuditAllInSearch}
        onAddJob={onAddJob}
        onExportAllData={onExportAllData}
        onExportPageAsCsv={onExportPageAsCsv}
        onImportAllData={onImportAllData}
        userRatingMode={userRatingMode}
        onUserRatingModeChange={onUserRatingModeChange}
        hideApplied={hideApplied}
        onHideAppliedChange={onHideAppliedChange}
        hideTagColors={hideTagColors}
        onHideTagColorsChange={onHideTagColorsChange}
        isEnabled={isEnabled}
      />

      <div
        className="app-insights-actions__item"
        onMouseEnter={() => {
          if (isEnabled) {
            setHoverPopover('userNotes')
          }
        }}
      >
        <button
          type="button"
          className={`app-insights-actions__button ${visiblePopover === 'userNotes' ? 'app-insights-actions__button--active' : ''}`}
        >
          User notes
        </button>
        <div
          className={`app-insights-hover-panel app-insights-hover-panel--menu app-insights-hover-panel--notes ${visiblePopover === 'userNotes' ? 'app-insights-hover-panel--open' : ''}`}
          ref={userNotesPanelRef}
          style={panelStyle('userNotes')}
          onMouseEnter={() => {
            if (isEnabled) {
              setHoverPopover('userNotes')
            }
          }}
        >
          <UserNotesStatsPanel
            visibleJobsCount={visibleJobsCount}
            jobsWithUserNotesCount={jobsWithUserNotesCount}
            userNotesCoveragePercent={userNotesCoveragePercent}
            userScoreValues={userScoreValues}
            dailyNoteAddsByDay={dailyNoteAddsByDay}
            dailyScoreBreakdownByDay={dailyScoreBreakdownByDay}
          />
        </div>
      </div>
        </div>
      )}
    </div>
  )
}
