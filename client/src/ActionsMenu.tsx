import { useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { type InsightsPopoverKey } from './usePinnedHoverPopover'
import { type AddedJobDraft, type UserRatingMode } from './ClientSaveLoad'

interface ActionsMenuProps {
  visiblePopover: InsightsPopoverKey | null
  setHoverPopover: (popover: InsightsPopoverKey) => void
  panelRef: RefObject<HTMLDivElement | null>
  panelStyle: CSSProperties
  onOpenAiCorpus: () => void
  onRunAuditAllInSearch: () => void
  onAddJob: (draft: AddedJobDraft) => void
  onExportAllData: () => void
  onImportAllData: (xmlText: string) => void | Promise<void>
  userRatingMode: UserRatingMode
  onUserRatingModeChange: (value: UserRatingMode) => void
  includeRemoteJobs: boolean
  onIncludeRemoteJobsChange: (value: boolean) => void
  isEnabled: boolean
}

export default function ActionsMenu({
  visiblePopover,
  setHoverPopover,
  panelRef,
  panelStyle,
  onOpenAiCorpus,
  onRunAuditAllInSearch,
  onAddJob,
  onExportAllData,
  onImportAllData,
  userRatingMode,
  onUserRatingModeChange,
  includeRemoteJobs,
  onIncludeRemoteJobsChange,
  isEnabled,
}: ActionsMenuProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [isAddJobDialogOpen, setIsAddJobDialogOpen] = useState(false)
  const [addJobDraft, setAddJobDraft] = useState<AddedJobDraft>({
    name: '',
    companyName: '',
    location: '',
    remote: 'Unknown',
    type: 'Unknown',
    description: '',
    sourceUrl: '',
    userScore: null,
  })

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const xmlText = await file.text()
      await onImportAllData(xmlText)
    } finally {
      event.currentTarget.value = ''
    }
  }

  const handleSubmitAddJob = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = addJobDraft.name.trim()
    const normalizedCompanyName = addJobDraft.companyName.trim()
    if (!normalizedName || !normalizedCompanyName) {
      window.alert('Job title and company are required.')
      return
    }

    onAddJob({
      ...addJobDraft,
      name: normalizedName,
      companyName: normalizedCompanyName,
      location: addJobDraft.location.trim() || 'Unknown',
      remote: addJobDraft.remote.trim() || 'Unknown',
      type: addJobDraft.type.trim() || 'Unknown',
      description: addJobDraft.description.trim(),
      sourceUrl: addJobDraft.sourceUrl.trim(),
      userScore: Number.isFinite(Number(addJobDraft.userScore))
        ? Math.max(0, Math.min(100, Number(addJobDraft.userScore)))
        : null,
    })

    setAddJobDraft({
      name: '',
      companyName: '',
      location: '',
      remote: 'Unknown',
      type: 'Unknown',
      description: '',
      sourceUrl: '',
      userScore: null,
    })
    setIsAddJobDialogOpen(false)
  }

  const addJobDialog = isAddJobDialogOpen ? (
    <div className="insights-add-job-dialog__overlay" role="presentation" onClick={() => setIsAddJobDialogOpen(false)}>
      <div className="insights-add-job-dialog" role="dialog" aria-modal="true" aria-label="Add job" onClick={(event) => event.stopPropagation()}>
        <form onSubmit={handleSubmitAddJob} className="insights-add-job-dialog__form">
          <h3 className="insights-add-job-dialog__title">Add job</h3>

          <label className="insights-add-job-dialog__field">
            <span>Job title</span>
            <input
              type="text"
              value={addJobDraft.name}
              onChange={(event) => setAddJobDraft((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>

          <label className="insights-add-job-dialog__field">
            <span>Company</span>
            <input
              type="text"
              value={addJobDraft.companyName}
              onChange={(event) => setAddJobDraft((prev) => ({ ...prev, companyName: event.target.value }))}
              required
            />
          </label>

          <label className="insights-add-job-dialog__field">
            <span>Location</span>
            <input
              type="text"
              value={addJobDraft.location}
              onChange={(event) => setAddJobDraft((prev) => ({ ...prev, location: event.target.value }))}
            />
          </label>

          <label className="insights-add-job-dialog__field">
            <span>Remote</span>
            <select
              value={addJobDraft.remote}
              onChange={(event) => setAddJobDraft((prev) => ({ ...prev, remote: event.target.value }))}
            >
              <option value="Unknown">Unknown</option>
              <option value="Remote">Remote</option>
              <option value="On-site">On-site</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </label>

          <label className="insights-add-job-dialog__field">
            <span>Type</span>
            <input
              type="text"
              value={addJobDraft.type}
              onChange={(event) => setAddJobDraft((prev) => ({ ...prev, type: event.target.value }))}
              placeholder="Full-time"
            />
          </label>

          <label className="insights-add-job-dialog__field">
            <span>Source URL (optional)</span>
            <input
              type="text"
              value={addJobDraft.sourceUrl}
              onChange={(event) => setAddJobDraft((prev) => ({ ...prev, sourceUrl: event.target.value }))}
              placeholder="https://..."
            />
          </label>

          <label className="insights-add-job-dialog__field">
            <span>User rating (0-100)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={addJobDraft.userScore ?? ''}
              onChange={(event) => {
                const value = event.target.value.trim()
                setAddJobDraft((prev) => ({
                  ...prev,
                  userScore: value.length === 0 ? null : Number(value),
                }))
              }}
            />
          </label>

          <label className="insights-add-job-dialog__field">
            <span>Description</span>
            <textarea
              value={addJobDraft.description}
              onChange={(event) => setAddJobDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
            />
          </label>

          <div className="insights-add-job-dialog__actions">
            <button type="button" className="insights-actions-menu__item" onClick={() => setIsAddJobDialogOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="insights-actions-menu__item">
              Save job
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null

  return (
    <div
      className="app-insights-actions__item"
      onMouseEnter={() => {
        if (isEnabled) {
          setHoverPopover('actions')
        }
      }}
    >
      <button
        type="button"
        className={`app-insights-actions__button ${visiblePopover === 'actions' ? 'app-insights-actions__button--active' : ''}`}
      >
        Actions
      </button>
      <div
        className={`app-insights-hover-panel app-insights-hover-panel--menu ${visiblePopover === 'actions' ? 'app-insights-hover-panel--open' : ''}`}
        ref={panelRef}
        style={panelStyle}
        onMouseEnter={() => {
          if (isEnabled) {
            setHoverPopover('actions')
          }
        }}
      >
        <div className="insights-actions-menu">
          <label className="insights-actions-menu__checkbox-row">
            <input
              type="checkbox"
              className="insights-actions-menu__checkbox"
              checked={includeRemoteJobs}
              onChange={(event) => onIncludeRemoteJobsChange(event.target.checked)}
            />
            <span>Include remote jobs</span>
          </label>

          <label className="insights-actions-menu__select-row">
            <span className="insights-actions-menu__select-label">User rating behavior</span>
            <select
              className="insights-actions-menu__select"
              value={userRatingMode}
              onChange={(event) => onUserRatingModeChange(event.target.value as UserRatingMode)}
            >
              <option value="none">No change</option>
              <option value="sort">Sort by user rating</option>
              <option value="ratedOnly">Show only user rated results</option>
              <option value="hideRated">Hide jobs with user rating</option>
            </select>
          </label>

          <button type="button" className="insights-actions-menu__item" onClick={onOpenAiCorpus}>
            Open AI Resume-vs-Jobs Text
          </button>
          <button type="button" className="insights-actions-menu__item" onClick={onRunAuditAllInSearch}>
            Run audit on all jobs in search
          </button>
          <button type="button" className="insights-actions-menu__item" onClick={() => setIsAddJobDialogOpen(true)}>
            Add job
          </button>
          <button type="button" className="insights-actions-menu__item" onClick={onExportAllData}>
            Export all data as XML
          </button>
          <button
            type="button"
            className="insights-actions-menu__item"
            onClick={() => importInputRef.current?.click()}
          >
            Import all data as XML
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />
        </div>
      </div>
      {typeof document !== 'undefined' && addJobDialog ? createPortal(addJobDialog, document.body) : null}
    </div>
  )
}