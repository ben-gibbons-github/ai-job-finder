import React, { useEffect, useRef, useState } from 'react';
import GenericPopover from './GenericPopover';
import JobTileDropdown from './JobTileDropdown';
import type { CompanyTagColor, JobStatus, JobStatusRecord, UserJobNote } from './ClientSaveLoad';
import { getScoreColors } from './scoreColors';

interface JobTileStatsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  isUserCreatedJob?: boolean;
  jobName?: string;
  jobSourceUrl?: string;
  companyName?: string;
  location?: string;
  jobType?: string;
  remote?: string;
  jobDescription?: string;
  jobSummary?: string;
  totalScore?: number;
  resumeScore?: number;
  impactScore?: number;
  qualityOfLifeScore?: number;
  locationScore?: number;
  freshScore?: number;
  auditScore?: number;
  jobStatusRecord?: JobStatusRecord;
  impactSummary?: string;
  qualityOfLifeSummary?: string;
  fullAuditText: string;
  jobUserNote?: UserJobNote;
  companyUserNote?: UserJobNote;
  companyTagColors?: CompanyTagColor[];
  onSaveUserNote?: (note: UserJobNote) => void;
  onClearUserNote?: () => void;
  onSaveCompanyUserNote?: (note: UserJobNote) => void;
  onClearCompanyUserNote?: () => void;
  onSetCompanyTagColors?: (colors: CompanyTagColor[]) => void;
  onSetJobStatus?: (nextStatus: JobStatus) => void;
  onAwardReadCompletion?: () => void;
  sectionToScrollTo?: string | null;
  // Dropdown action props
  resumeId?: string;
  resumeText?: string;
  resumeDisplayName?: string;
  selectedResumeIds?: string[];
  resumeCatalogById?: Record<string, { displayName?: string; name?: string; id?: string }>;
  onRunAudit?: () => void;
  canRunAudit?: boolean;
  auditMenuLabel?: string;
  onHideJob?: (jobUrl?: string) => void;
  onHideCompany?: (companyName?: string) => void;
  isHighlighted?: boolean;
  onToggleHighlightJob?: () => void;
  onSaveUserCreatedJobDetails?: (updates: {
    name: string;
    companyName: string;
    location: string;
    remote: string;
    type: string;
    description: string;
  }) => void;
}

const formatPercent = (score?: number): string => {
  if (!Number.isFinite(score)) {
    return '—';
  }
  return `${((score as number) * 100).toFixed(1)}%`;
};

const withFallback = (value?: string): string => {
  const normalized = String(value ?? '').trim();
  return normalized || '—';
};

// Colours are now supplied via getScoreColors() inline styles; no band needed.

const inlineTokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)|\*\*([^*]+)\*\*/g;

const splitUrlAndTrailingPunctuation = (rawUrl: string): { url: string; trailing: string } => {
  const match = rawUrl.match(/[),.;!?]+$/);
  if (!match) {
    return { url: rawUrl, trailing: '' };
  }
  return {
    url: rawUrl.slice(0, -match[0].length),
    trailing: match[0],
  };
};

const renderInlineRichText = (line: string, keyPrefix: string): React.ReactNode[] => {
  const output: React.ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  inlineTokenRegex.lastIndex = 0;
  let match = inlineTokenRegex.exec(line);
  while (match) {
    const start = match.index;
    const end = start + match[0].length;

    if (start > cursor) {
      output.push(line.slice(cursor, start));
    }

    const markdownLabel = match[1];
    const markdownUrl = match[2];
    const rawUrl = match[3];
    const boldText = match[4];

    if (markdownLabel && markdownUrl) {
      output.push(
        <a
          key={`${keyPrefix}-link-${tokenIndex}`}
          href={markdownUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="job-stats-link"
        >
          {markdownLabel}
        </a>,
      );
    } else if (rawUrl) {
      const { url, trailing } = splitUrlAndTrailingPunctuation(rawUrl);
      output.push(
        <a
          key={`${keyPrefix}-url-${tokenIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="job-stats-link"
        >
          {url}
        </a>,
      );
      if (trailing) {
        output.push(trailing);
      }
    } else if (boldText) {
      output.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex}`} className="job-stats-strong">
          {boldText}
        </strong>,
      );
    } else {
      output.push(match[0]);
    }

    cursor = end;
    tokenIndex += 1;
    match = inlineTokenRegex.exec(line);
  }

  if (cursor < line.length) {
    output.push(line.slice(cursor));
  }

  return output;
};

const RichTextBlock: React.FC<{ text?: string; fallback: string }> = ({ text, fallback }) => {
  const content = (text || '').trim();
  const safeContent = content || fallback;
  const paragraphs = safeContent.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="job-stats-text-block">
      {paragraphs.map((paragraph, paragraphIndex) => {
        const lines = paragraph.split('\n');
        return (
          <p key={`p-${paragraphIndex}`} className="job-stats-paragraph">
            {lines.map((line, lineIndex) => (
              <React.Fragment key={`l-${paragraphIndex}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInlineRichText(line, `p${paragraphIndex}-l${lineIndex}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};

const COMPANY_TAG_COLOR_OPTIONS: Array<{ color: CompanyTagColor; label: string }> = [
  { color: 'red', label: 'Red' },
  { color: 'orange', label: 'Orange' },
  { color: 'yellow', label: 'Yellow' },
  { color: 'green', label: 'Green' },
  { color: 'blue', label: 'Blue' },
  { color: 'purple', label: 'Purple' },
];

interface SectionScoreBadgeProps {
  label: string;
  score?: number;
  extraClassName?: string;
}

const SectionScoreBadge: React.FC<SectionScoreBadgeProps> = ({ label, score, extraClassName }) => {
  return (
    <span className={`job-stats-inline-score ${extraClassName || ''}`.trim()} style={getScoreColors(score)}>
      <span>{label}</span>
      <strong>{formatPercent(score)}</strong>
    </span>
  );
};

const JobTileStatsPopover: React.FC<JobTileStatsPopoverProps> = ({
  isOpen,
  onClose,
  isUserCreatedJob,
  jobName,
  jobSourceUrl,
  companyName,
  location,
  jobType,
  remote,
  jobDescription,
  jobSummary,
  totalScore,
  resumeScore,
  impactScore,
  qualityOfLifeScore,
  locationScore,
  freshScore,
  auditScore,
  jobStatusRecord,
  impactSummary,
  qualityOfLifeSummary,
  fullAuditText,
  companyUserNote,
  companyTagColors,
  onSaveCompanyUserNote,
  onClearCompanyUserNote,
  onSetCompanyTagColors,
  onSetJobStatus,
  onAwardReadCompletion,
  sectionToScrollTo,
  resumeId,
  resumeText,
  resumeDisplayName,
  selectedResumeIds,
  resumeCatalogById,
  onRunAudit,
  canRunAudit,
  auditMenuLabel,
  onHideJob,
  onHideCompany,
  isHighlighted,
  onToggleHighlightJob,
  onSaveUserCreatedJobDetails,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const hasAwardedReadBonusRef = useRef(false);
  const hasSeenTopRef = useRef(false);
  const companyNotesDirtyRef = useRef(false);
  const [companyNotesText, setCompanyNotesText] = useState(companyUserNote?.notes ?? '');
  const [companyScoreText, setCompanyScoreText] = useState(
    companyUserNote?.userScore != null ? String(companyUserNote.userScore) : '',
  );
  const [editableJobName, setEditableJobName] = useState(jobName ?? '');
  const [editableCompanyName, setEditableCompanyName] = useState(companyName ?? '');
  const [editableLocation, setEditableLocation] = useState(location ?? '');
  const [editableRemote, setEditableRemote] = useState(remote ?? '');
  const [editableType, setEditableType] = useState(jobType ?? '');
  const [editableDescription, setEditableDescription] = useState(jobDescription ?? '');
  const [selectedJobStatus, setSelectedJobStatus] = useState<JobStatus>(jobStatusRecord?.currentStatus ?? 'none');
  const [isCompanyTagDropdownOpen, setIsCompanyTagDropdownOpen] = useState(false);
  const companyTagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      hasAwardedReadBonusRef.current = false;
      hasSeenTopRef.current = false;
      companyNotesDirtyRef.current = false;
      setCompanyNotesText(companyUserNote?.notes ?? '');
      setCompanyScoreText(companyUserNote?.userScore != null ? String(companyUserNote.userScore) : '');
      setEditableJobName(jobName ?? '');
      setEditableCompanyName(companyName ?? '');
      setEditableLocation(location ?? '');
      setEditableRemote(remote ?? '');
      setEditableType(jobType ?? '');
      setEditableDescription(jobDescription ?? '');
      setSelectedJobStatus(jobStatusRecord?.currentStatus ?? 'none');
      setIsCompanyTagDropdownOpen(false);

      window.requestAnimationFrame(() => {
        const container = contentRef.current;
        if (!container || hasAwardedReadBonusRef.current) {
          return;
        }

        if (container.scrollHeight <= container.clientHeight + 4) {
          hasAwardedReadBonusRef.current = true;
          onAwardReadCompletion?.();
        }
      });
    }
  }, [isOpen, companyUserNote, onAwardReadCompletion, jobName, companyName, location, remote, jobType, jobDescription, jobStatusRecord]);

  // Auto-save company notes after a short debounce whenever the user edits them
  useEffect(() => {
    if (!companyNotesDirtyRef.current) return;
    const timer = setTimeout(() => {
      const raw = parseInt(companyScoreText, 10);
      const userScore = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : null;
      onSaveCompanyUserNote?.({ notes: companyNotesText.trim(), userScore });
    }, 600);
    return () => clearTimeout(timer);
  }, [companyNotesText, companyScoreText, onSaveCompanyUserNote]);

  // Scroll to a specific section when the popover opens with a target
  useEffect(() => {
    if (!isOpen || !sectionToScrollTo) return;
    const timer = setTimeout(() => {
      const el = contentRef.current?.querySelector(`#stats-section-${sectionToScrollTo}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen, sectionToScrollTo]);

  useEffect(() => {
    if (!isCompanyTagDropdownOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (!companyTagDropdownRef.current?.contains(target)) {
        setIsCompanyTagDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isCompanyTagDropdownOpen]);

  const handleSaveUserCreatedJobDetails = () => {
    const normalizedName = editableJobName.trim();
    const normalizedCompany = editableCompanyName.trim();
    if (!normalizedName || !normalizedCompany) {
      window.alert('Job title and company are required.');
      return;
    }

    onSaveUserCreatedJobDetails?.({
      name: normalizedName,
      companyName: normalizedCompany,
      location: editableLocation.trim() || 'Unknown',
      remote: editableRemote.trim() || 'Unknown',
      type: editableType.trim() || 'Unknown',
      description: editableDescription.trim(),
    });
  };

  const handleJobStatusChange = (nextStatus: JobStatus) => {
    setSelectedJobStatus(nextStatus);
    onSetJobStatus?.(nextStatus);
  };

  const jobStatusHistory = jobStatusRecord?.history ?? [];

  const handleContentScroll = () => {
    const container = contentRef.current;
    if (!container || hasAwardedReadBonusRef.current) {
      return;
    }

    if (container.scrollTop <= 24) {
      hasSeenTopRef.current = true;
    }

    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;
    if (hasSeenTopRef.current && atBottom) {
      hasAwardedReadBonusRef.current = true;
      onAwardReadCompletion?.();
    }
  };

  const handleClearCompanyNotes = () => {
    companyNotesDirtyRef.current = false;
    setCompanyNotesText('');
    setCompanyScoreText('');
    onClearCompanyUserNote?.();
  };

  const selectedCompanyTagColors = Array.isArray(companyTagColors) ? companyTagColors : [];

  const toggleCompanyTagColor = (color: CompanyTagColor) => {
    const next = selectedCompanyTagColors.includes(color)
      ? selectedCompanyTagColors.filter((entry) => entry !== color)
      : [...selectedCompanyTagColors, color];

    const ordered = COMPANY_TAG_COLOR_OPTIONS
      .map((option) => option.color)
      .filter((optionColor) => next.includes(optionColor));

    onSetCompanyTagColors?.(ordered);
  };

  const openJobListing = () => {
    if (!jobSourceUrl) {
      return;
    }
    window.open(jobSourceUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <GenericPopover
      isOpen={isOpen}
      onClose={onClose}
      title={`${jobName || 'Job'} stats`}
      className="job-stats-popover"
      contentRef={contentRef}
      onContentScroll={handleContentScroll}
      headerActions={(
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <JobTileDropdown
            className="job-tile-dropdown--inline"
            job={{
              name: jobName,
              company_name: companyName,
              location,
              remote,
              description: jobDescription,
              type: jobType,
              source_url: jobSourceUrl,
            }}
            resumeId={resumeId}
            resumeText={resumeText}
            resumeDisplayName={resumeDisplayName}
            selectedResumeIds={selectedResumeIds}
            resumeCatalogById={resumeCatalogById}
            onRunAudit={onRunAudit}
            canRunAudit={canRunAudit}
            auditMenuLabel={auditMenuLabel}
            onHideJob={onHideJob}
            onHideCompany={onHideCompany}
            isHighlighted={isHighlighted}
            onToggleHighlightJob={onToggleHighlightJob}
          />
          <button
            type="button"
            className="job-stats-open-listing-btn"
            onClick={openJobListing}
            disabled={!jobSourceUrl}
            title={jobSourceUrl ? 'Open source job post' : 'No job URL available'}
          >
            View job listing
          </button>
        </div>
      )}
    >
      <div className="job-stats-content">
        <section className="job-stats-section">
          <h3>Job details</h3>
          {isUserCreatedJob ? (
            <div className="job-stats-user-notes-fields">
              <label className="job-stats-user-notes-label" htmlFor="editable-job-name">
                Job title
              </label>
              <input
                id="editable-job-name"
                type="text"
                className="job-stats-user-notes-score-input"
                value={editableJobName}
                onChange={(event) => setEditableJobName(event.target.value)}
              />

              <label className="job-stats-user-notes-label" htmlFor="editable-company-name">
                Company
              </label>
              <input
                id="editable-company-name"
                type="text"
                className="job-stats-user-notes-score-input"
                value={editableCompanyName}
                onChange={(event) => setEditableCompanyName(event.target.value)}
              />

              <label className="job-stats-user-notes-label" htmlFor="editable-job-location">
                Location
              </label>
              <input
                id="editable-job-location"
                type="text"
                className="job-stats-user-notes-score-input"
                value={editableLocation}
                onChange={(event) => setEditableLocation(event.target.value)}
              />

              <label className="job-stats-user-notes-label" htmlFor="editable-job-remote">
                Remote
              </label>
              <input
                id="editable-job-remote"
                type="text"
                className="job-stats-user-notes-score-input"
                value={editableRemote}
                onChange={(event) => setEditableRemote(event.target.value)}
              />

              <label className="job-stats-user-notes-label" htmlFor="editable-job-type">
                Type
              </label>
              <input
                id="editable-job-type"
                type="text"
                className="job-stats-user-notes-score-input"
                value={editableType}
                onChange={(event) => setEditableType(event.target.value)}
              />

              <div className="job-stats-user-notes-actions">
                <button
                  type="button"
                  className="job-stats-user-notes-save-btn"
                  onClick={handleSaveUserCreatedJobDetails}
                >
                  Save job details
                </button>
              </div>
            </div>
          ) : (
            <>
            <div className="job-stats-meta-grid">
              <div className="job-stats-meta-item">
                <span className="job-stats-meta-label">Company</span>
                <strong>{withFallback(companyName)}</strong>
              </div>
              <div className="job-stats-meta-item">
                <span className="job-stats-meta-label">Location</span>
                <strong>{withFallback(location)}</strong>
              </div>
              <div className="job-stats-meta-item">
                <span className="job-stats-meta-label">Type</span>
                <strong>{withFallback(jobType)}</strong>
              </div>
              <div className="job-stats-meta-item">
                <span className="job-stats-meta-label">Remote</span>
                <strong>{withFallback(remote)}</strong>
              </div>
              {jobSourceUrl && (
                <div className="job-stats-meta-item job-stats-meta-item--wide">
                  <span className="job-stats-meta-label">Source URL</span>
                  <a href={jobSourceUrl} target="_blank" rel="noopener noreferrer" className="job-stats-link">{jobSourceUrl}</a>
                </div>
              )}
            </div>
            <div className="job-stats-score-divider" />
            <div className="job-stats-score-bubbles">
              <div className="job-stats-score-bubble" style={getScoreColors(totalScore)}><span>Total</span><strong>{formatPercent(totalScore)}</strong></div>
              <div className="job-stats-score-bubble" style={getScoreColors(resumeScore)}><span>Resume</span><strong>{formatPercent(resumeScore)}</strong></div>
              <div className="job-stats-score-bubble" style={getScoreColors(impactScore)}><span>Impact</span><strong>{formatPercent(impactScore)}</strong></div>
              <div className="job-stats-score-bubble" style={getScoreColors(qualityOfLifeScore)}><span>QoL</span><strong>{formatPercent(qualityOfLifeScore)}</strong></div>
              <div className="job-stats-score-bubble" style={getScoreColors(locationScore)}><span>Location</span><strong>{formatPercent(locationScore)}</strong></div>
              <div className="job-stats-score-bubble" style={getScoreColors(freshScore)}><span>Fresh</span><strong>{formatPercent(freshScore)}</strong></div>
              <div className="job-stats-score-bubble" style={getScoreColors(auditScore)}><span>Audit</span><strong>{formatPercent(auditScore)}</strong></div>
            </div>
            </>
          )}
        </section>

        <section className="job-stats-section">
          <h3>Job description</h3>
          {isUserCreatedJob ? (
            <div className="job-stats-user-notes-fields">
              <label className="job-stats-user-notes-label" htmlFor="editable-job-description">
                Description
              </label>
              <textarea
                id="editable-job-description"
                className="job-stats-user-notes-textarea"
                value={editableDescription}
                onChange={(event) => setEditableDescription(event.target.value)}
                rows={5}
                placeholder="Add details about this role..."
              />
              <div className="job-stats-user-notes-actions">
                <button
                  type="button"
                  className="job-stats-user-notes-save-btn"
                  onClick={handleSaveUserCreatedJobDetails}
                >
                  Save description
                </button>
              </div>
            </div>
          ) : (
            <RichTextBlock text={jobDescription} fallback="No job description available." />
          )}
          {jobSummary && <RichTextBlock text={jobSummary} fallback="" />}
        </section>

        <section id="stats-section-impact" className="job-stats-section">
          <div className="job-stats-section-heading">
            <h3>Impact report</h3>
            <SectionScoreBadge label="Impact" score={impactScore} extraClassName="job-stats-inline-score--impact" />
          </div>
          <RichTextBlock text={impactSummary} fallback="No impact report available yet." />
        </section>

        <section id="stats-section-qol" className="job-stats-section">
          <div className="job-stats-section-heading">
            <h3>Quality of life report</h3>
            <SectionScoreBadge label="QoL" score={qualityOfLifeScore} />
          </div>
          <RichTextBlock text={qualityOfLifeSummary} fallback="No quality-of-life report available yet." />
        </section>

        <section id="stats-section-audit" className="job-stats-section">
          <div className="job-stats-section-heading">
            <h3>AI audit report</h3>
            <SectionScoreBadge label="Audit" score={auditScore} extraClassName="job-stats-inline-score--audit" />
          </div>
          <RichTextBlock text={fullAuditText} fallback="No audit report available yet." />
        </section>

        <section className="job-stats-section job-stats-section--user-notes">
          <h3>Company notes</h3>
          <div className="job-stats-status-meta-row">
            <div>
              <label className="job-stats-user-notes-label" htmlFor="job-status-select">
                Current status
              </label>
              <select
                id="job-status-select"
                className="job-stats-status-select"
                value={selectedJobStatus}
                onChange={(event) => handleJobStatusChange(event.target.value as JobStatus)}
              >
                <option value="none">none</option>
                <option value="applied">applied</option>
                <option value="interviewing">interviewing</option>
                <option value="accepted">accepted</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
            <div>
              <label className="job-stats-user-notes-label" htmlFor="company-user-notes-score">
                Company score (0-100)
              </label>
              <input
                id="company-user-notes-score"
                type="number"
                min={0}
                max={100}
                className="job-stats-user-notes-score-input"
                value={companyScoreText}
                onChange={(e) => { companyNotesDirtyRef.current = true; setCompanyScoreText(e.target.value); }}
                placeholder="—"
              />
            </div>
          </div>
          <div className="job-stats-status-history">
            <div className="job-stats-status-history__label">History</div>
            {jobStatusHistory.length > 0 ? (
              <ul className="job-stats-status-history__list">
                {jobStatusHistory.slice().reverse().map((entry) => (
                  <li key={`${entry.changedAt}-${entry.beforeStatus}-${entry.afterStatus}`} className="job-stats-status-history__item">
                    <span className="job-stats-status-history__time">{entry.changedAt}</span>
                    <span className="job-stats-status-history__change">
                      {entry.beforeStatus} → {entry.afterStatus}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="job-stats-status-history__empty">No status changes yet.</p>
            )}
          </div>
          <div className="job-stats-user-notes-fields">
            <div className="job-stats-company-tags" ref={companyTagDropdownRef}>
              <span className="job-stats-user-notes-label">Company tags</span>
              <button
                type="button"
                className="job-stats-company-tags__toggle"
                onClick={() => setIsCompanyTagDropdownOpen((value) => !value)}
                aria-expanded={isCompanyTagDropdownOpen}
                aria-haspopup="menu"
              >
                {selectedCompanyTagColors.length > 0
                  ? `Tags selected: ${selectedCompanyTagColors.length}`
                  : 'Choose color tags'}
              </button>

              {selectedCompanyTagColors.length > 0 && (
                <div className="job-stats-company-tags__chips" aria-live="polite">
                  {selectedCompanyTagColors.map((color) => (
                    <span key={color} className={`job-stats-company-tags__chip job-stats-company-tags__chip--${color}`}>
                      {color}
                    </span>
                  ))}
                </div>
              )}

              {isCompanyTagDropdownOpen && (
                <div className="job-stats-company-tags__menu" role="menu" aria-label="Company color tags">
                  {COMPANY_TAG_COLOR_OPTIONS.map((option) => (
                    <label key={option.color} className="job-stats-company-tags__option">
                      <input
                        type="checkbox"
                        checked={selectedCompanyTagColors.includes(option.color)}
                        onChange={() => toggleCompanyTagColor(option.color)}
                      />
                      <span className={`job-stats-company-tags__swatch job-stats-company-tags__swatch--${option.color}`} aria-hidden="true" />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <label className="job-stats-user-notes-label" htmlFor="company-user-notes-text">
              Company notes
            </label>
            <textarea
              id="company-user-notes-text"
              className="job-stats-user-notes-textarea"
              value={companyNotesText}
              onChange={(e) => { companyNotesDirtyRef.current = true; setCompanyNotesText(e.target.value); }}
              placeholder="Add your notes about this company..."
              rows={4}
            />
            {(companyUserNote?.notes || companyUserNote?.userScore != null) && (
              <div className="job-stats-user-notes-actions">
                <button
                  type="button"
                  className="job-stats-user-notes-clear-btn"
                  onClick={handleClearCompanyNotes}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </GenericPopover>
  );
};

export default JobTileStatsPopover;
