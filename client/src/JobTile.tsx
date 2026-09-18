import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import JobTileDropdown from './JobTileDropdown';
import JobTileStatsPopover from './JobTileStatsPopover';
import type { CompanyTagColor, JobStatus, JobStatusRecord, UserJobNote } from './ClientSaveLoad';
import { getScoreColors } from './scoreColors';
import { EMPLOYER_IMPACT_CATEGORY_LABELS, EMPLOYER_IMPACT_CATEGORY_ICONS, type EmployerImpactCategory } from './EmployerImpactCategory';

const JOB_TYPE_CLASSIFICATION_UI_ENABLED = import.meta.env.VITE_JOB_TYPE_CLASSIFICATION_UI_ENABLED === '1'
  || import.meta.env.VITE_JOB_TYPE_CLASSIFICATION_UI_ENABLED === 'true';

interface JobScores {
  resume: number;
  impact: number;
  location: number;
  fresh: number;
  audit: number;
  qualityOfLife: number;
}

interface JobAiPayload {
  audit?: {
    hasData?: boolean;
    score?: number;
    redFlagScore?: number;
    summary?: string;
    redFlagSummary?: string;
  };
  impact?: {
    hasData?: boolean;
    score?: number;
    summary?: string;
  };
  qualityOfLife?: {
    hasData?: boolean;
    score?: number;
    summary?: string;
  };
}

interface RankedJobWrapper {
  job?: {
    name?: string;
    company_name?: string;
    location?: string;
    remote?: string;
    description?: string;
    type?: string;
    source_url?: string;
    last_scraped_at?: string | Date;
    ai_summary?: string;
    job_type_classification_version?: string;
    job_type_primary_category?: string;
    job_type_categories?: string[];
    job_type_classification_confidence?: number;
  };
  scores?: JobScores;
  totalScore?: number;
  debug_flag?: string;
  aiPayload?: JobAiPayload;
  employerImpactCategories?: EmployerImpactCategory[];
  isEligibleForEmployerImpactBadges?: boolean;
  employerImpactBadgeEligibilityReason?: string;
  debugInfo?: {
    lat: number | null;
    lon: number | null;
    location: {
      userLat: number | null;
      userLon: number | null;
      jobLat: number | null;
      jobLon: number | null;
      matchedLocation: string | null;
      locationFallback: string | null;
      userCountry: string | null;
      jobCountry: string | null;
      countryPenalty: string;
      distanceKm: number | null;
      distanceMiles: number | null;
      locationScore: number;
      calculation: string;
    };
    promptVersion: string;
    aiPrompt?: string;
    aiCacheKey?: string;
  };
}

interface ResumeCatalogEntry {
  displayName?: string;
  name?: string;
  id?: string;
}

interface AuditRequestKey {
  source_url?: string;
  name?: string;
  company_name?: string;
}

interface AuditResult {
  auditScore: number;
  auditText: string;
  error?: string;
}

interface ImpactResult {
  ai_impact_score: number;
  ai_impact_summary: string;
  error?: string;
}

interface QualityOfLifeResult {
  employeeQualityOfLifeScore: number;
  employeeQualityOfLifeSummary: string;
  error?: string;
}

interface JobTileProps {
  wrapper?: RankedJobWrapper;
  isUserCreatedJob?: boolean;
  resumeId?: string;
  resumeText?: string;
  resumeDisplayName?: string;
  selectedResumeIds?: string[];
  resumeCatalogById?: Record<string, ResumeCatalogEntry>;
  onAuditRequest?: (key: AuditRequestKey, onResult: (result: AuditResult) => void) => void;
  onRerollAiRequest?: (key: AuditRequestKey, onResult: (result: AuditResult & { error?: string }) => void) => void;
  auditResultOverride?: AuditResult;
  impactResultOverride?: ImpactResult;
  qualityOfLifeResultOverride?: QualityOfLifeResult;
  onHideJob?: (jobUrl?: string) => void;
  onHideCompany?: (companyName?: string) => void;
  isHighlighted?: boolean;
  onToggleHighlightJob?: (jobUrl?: string) => void;
  jobStatusRecord?: JobStatusRecord;
  onSetJobStatus?: (nextStatus: JobStatus) => void;
  jobUserNote?: UserJobNote;
  companyUserNote?: UserJobNote;
  onSaveUserNote?: (note: UserJobNote) => void;
  onClearUserNote?: () => void;
  onSaveCompanyUserNote?: (note: UserJobNote) => void;
  onClearCompanyUserNote?: () => void;
  companyTagColors?: CompanyTagColor[];
  onSetCompanyTagColors?: (colors: CompanyTagColor[]) => void;
  onAwardReadCompletion?: () => void;
  hasReadCompletionAwarded?: boolean;
  onSaveUserCreatedJobDetails?: (sourceUrl: string, updates: {
    name: string;
    companyName: string;
    location: string;
    remote: string;
    type: string;
    description: string;
  }) => void;
  scoreWeights?: {
    resume: number;
    impact: number;
    location: number;
    fresh: number;
    audit: number;
    qualityOfLife: number;
  };
  searchDebugEnabled?: boolean;
}

const formatScore = (score: number): string => {
  return (score * 100).toFixed(1);
};

const formatDetectedCountry = (country: string | null): string => {
  return country?.replace(/\b\w/g, (character) => character.toUpperCase()) ?? 'not detected';
};

const getPreview = (value: string, maxLength = 160): string => {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
};

const noteInlineLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/i;

const trimUrlPunctuation = (rawUrl: string): string => {
  return rawUrl.replace(/[),.;!?]+$/, '');
};

const getFirstLinkFromNotes = (notes?: string): string | null => {
  const text = String(notes ?? '').trim();
  if (!text) {
    return null;
  }

  const match = text.match(noteInlineLinkRegex);
  if (!match) {
    return null;
  }

  const markdownUrl = match[2];
  const rawUrl = match[3];
  const candidate = markdownUrl || rawUrl;
  if (!candidate) {
    return null;
  }

  const cleaned = trimUrlPunctuation(candidate);
  return cleaned || null;
};

const getUserScoreBand = (score: number): 'blue' | 'green' | 'yellow' | 'red' => {
  if (score >= 80) return 'blue';
  if (score >= 60) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
};

/** If remote is 'Unknown' but location implies remote, infer 'Remote'. */
const resolveRemoteDisplay = (remote: string | undefined, location: string | undefined): string => {
  const r = String(remote ?? '').trim();
  const loc = String(location ?? '').trim().toLowerCase();
  if (r && r.toLowerCase() !== 'unknown') return r;
  if (/\bremote\b|\bhybrid\b|work from home|\bwfh\b/.test(loc)) return 'Remote';
  return r || 'Unknown';
};

const getSourceHost = (sourceUrl?: string): string => {
  if (!sourceUrl) {
    return 'Source unavailable';
  }
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'External posting';
  }
};

const formatClassificationLabel = (value: string): string => {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const JobTile: React.FC<JobTileProps> = ({
  wrapper,
  isUserCreatedJob,
  resumeId,
  resumeText,
  resumeDisplayName,
  selectedResumeIds,
  resumeCatalogById,
  onAuditRequest,
  onRerollAiRequest,
  auditResultOverride,
  impactResultOverride,
  qualityOfLifeResultOverride,
  onHideJob,
  onHideCompany,
  isHighlighted,
  onToggleHighlightJob,
  jobStatusRecord,
  onSetJobStatus,
  jobUserNote,
  companyUserNote,
  onSaveUserNote,
  onClearUserNote,
  onSaveCompanyUserNote,
  onClearCompanyUserNote,
  companyTagColors,
  onSetCompanyTagColors,
  onAwardReadCompletion,
  hasReadCompletionAwarded,
  onSaveUserCreatedJobDetails,
  scoreWeights,
  searchDebugEnabled,
}) => {
  const job = wrapper?.job;
  const scores = wrapper?.scores;
  const totalScore = wrapper?.totalScore;
  const debugFlag = searchDebugEnabled ? String(wrapper?.debug_flag ?? '').trim() : '';
  const aiPayload = wrapper?.aiPayload;
  const debugInfo = wrapper?.debugInfo;

  // Normalize the total score to the same 0-1 scale used by the category scores.
  const sumOfWeights = scoreWeights
    ? scoreWeights.resume + scoreWeights.impact + scoreWeights.location +
      scoreWeights.fresh + scoreWeights.audit + scoreWeights.qualityOfLife
    : 6
  const normalizedTotalScore = (totalScore !== undefined && sumOfWeights > 0)
    ? totalScore / sumOfWeights
    : undefined
  const currentJobStatus = jobStatusRecord?.currentStatus ?? 'none';
  const payloadAuditHasData = Boolean(aiPayload?.audit?.hasData);
  const payloadImpactHasData = Boolean(aiPayload?.impact?.hasData);
  const payloadQualityOfLifeHasData = Boolean(aiPayload?.qualityOfLife?.hasData);

  const [auditLoading, setAuditLoading] = useState(false);
  const [rerollLoading, setRerollLoading] = useState(false);
  const [rerollError, setRerollError] = useState<string | null>(null);
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const [auditText, setAuditText] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isStatsPopoverOpen, setIsStatsPopoverOpen] = useState(false);
  const [sectionToScrollTo, setSectionToScrollTo] = useState<string | null>(null);

  const hasJobUserNotes = Boolean(
    jobUserNote && (jobUserNote.notes.length > 0 || jobUserNote.userScore !== null),
  );
  const hasCompanyUserNotes = Boolean(
    companyUserNote && companyUserNote.notes && companyUserNote.notes.length > 0,
  );

  // auditResultOverride comes from the App-level job:audit:result listener;
  // local ack state takes precedence when this tile triggered the audit.
  const resolvedAuditScore =
    auditScore ??
    auditResultOverride?.auditScore ??
    (payloadAuditHasData ? (aiPayload?.audit?.score ?? null) : null);
  const resolvedAuditText =
    auditText ??
    auditResultOverride?.auditText ??
    (payloadAuditHasData ? (String(aiPayload?.audit?.summary ?? '').trim() || null) : null);
  const resolvedAuditError = auditError ?? (auditResultOverride?.error ?? null);

  const handleRunAudit = () => {
    if (!onAuditRequest || auditLoading) return;
    setAuditLoading(true);
    setAuditError(null);
    onAuditRequest(
      { source_url: job?.source_url, name: job?.name, company_name: job?.company_name },
      (result) => {
        setAuditLoading(false);
        if (result.error) {
          setAuditError(result.error);
        } else {
          setAuditScore(result.auditScore);
          setAuditText(result.auditText);
        }
      },
    );
  };

  const handleRerollAi = () => {
    if (!onRerollAiRequest || rerollLoading) return;
    setRerollLoading(true);
    setRerollError(null);
    onRerollAiRequest(
      { source_url: job?.source_url, name: job?.name, company_name: job?.company_name },
      (result) => {
        setRerollLoading(false);
        if (result.error) {
          setRerollError(result.error);
          return;
        }

        setRerollError(null);
        setAuditError(null);
        setAuditScore(result.auditScore);
        setAuditText(result.auditText);
      },
    );
  };

  const displayedAuditScore = resolvedAuditScore !== null ? resolvedAuditScore / 100 : scores?.audit;
  const displayedImpactScore = impactResultOverride
    ? impactResultOverride.ai_impact_score / 100
    : payloadImpactHasData && Number.isFinite(Number(aiPayload?.impact?.score))
      ? Number(aiPayload?.impact?.score) / 100
      : scores?.impact;
  const displayedQualityOfLifeScore = qualityOfLifeResultOverride
    ? qualityOfLifeResultOverride.employeeQualityOfLifeScore / 100
    : payloadQualityOfLifeHasData && Number.isFinite(Number(aiPayload?.qualityOfLife?.score))
      ? Number(aiPayload?.qualityOfLife?.score) / 100
      : scores?.qualityOfLife;
  const resolvedImpactSummary = (impactResultOverride?.ai_impact_summary ?? aiPayload?.impact?.summary ?? '').trim();
  const resolvedQualityOfLifeSummary = (qualityOfLifeResultOverride?.employeeQualityOfLifeSummary ?? aiPayload?.qualityOfLife?.summary ?? '').trim();
  const normalizedAuditText = String(resolvedAuditText ?? '').trim().toLowerCase();
  const normalizedImpactSummary = resolvedImpactSummary.trim().toLowerCase();

  const auditFailed = Boolean(resolvedAuditError) || normalizedAuditText.includes('searchaudit failed');
  const impactFailed = Boolean(impactResultOverride?.error) || normalizedImpactSummary.includes('searchimpactai failed');

  const hasResolvedAudit = !auditFailed && (
    resolvedAuditScore !== null ||
    normalizedAuditText.length > 0
  );
  const hasResolvedImpact = !impactFailed && (
    Boolean(impactResultOverride) ||
    payloadImpactHasData
  ) && (
    normalizedImpactSummary.length > 0 ||
    Number.isFinite(Number(impactResultOverride?.ai_impact_score)) ||
    (payloadImpactHasData && Number.isFinite(Number(aiPayload?.impact?.score)))
  );
  const isAuditComplete = hasResolvedAudit && hasResolvedImpact;
  const auditNeedsRetry = (auditFailed || impactFailed) && !auditLoading;

  const resumeTooltip = resumeText?.trim().length
    ? `Resume relevance from uploaded resume text: ${getPreview(resumeText, 140)}`
    : 'Resume score is text similarity based. Upload a resume to improve this signal.';
  const impactTooltip = resolvedImpactSummary
    ? `Impact summary: ${getPreview(resolvedImpactSummary, 170)}`
    : 'No impact report available yet. Run an audit to populate impact details.';
  const qualityOfLifeTooltip = resolvedQualityOfLifeSummary
    ? `Quality-of-life summary: ${getPreview(resolvedQualityOfLifeSummary, 170)}`
    : 'No quality-of-life report available yet. Run an audit to populate QoL details.';
  const locationTooltip = `Job location: ${String(job?.location ?? 'Unknown')}. Location score reflects alignment with your selected location.`;
  const freshTooltip = 'Fresh score reflects how recent this posting appears in the source feeds.';
  const auditTooltip = resolvedAuditText
    ? `Audit details: ${getPreview(resolvedAuditText, 170)}`
    : 'No audit report available yet. Run audit to generate score rationale.';

  const sourceHost = getSourceHost(job?.source_url);
  const companyNoteLink = getFirstLinkFromNotes(companyUserNote?.notes);
  const jobNoteLink = getFirstLinkFromNotes(jobUserNote?.notes);
  const lastScrapedAt = job?.last_scraped_at ? new Date(job.last_scraped_at) : null;
  const lastScrapedDisplay = lastScrapedAt && Number.isFinite(lastScrapedAt.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(lastScrapedAt)
    : null;

  const getFullAuditText = (): string => {
    if (!resolvedAuditText) {
      return 'No audit available yet.';
    }

    try {
      const parsed = JSON.parse(resolvedAuditText);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return resolvedAuditText;
    }
  };

  const openExternalUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const classificationCategories = Array.from(new Set((job?.job_type_categories ?? []).filter(Boolean)));
  const primaryClassification = job?.job_type_primary_category?.trim() ?? '';
  const classificationLabels = classificationCategories.length > 0
    ? classificationCategories
    : (primaryClassification ? [primaryClassification] : []);
  const employerImpactCategoryBadges = (wrapper?.employerImpactCategories ?? [])
    .map((category) => ({
      category,
      icon: EMPLOYER_IMPACT_CATEGORY_ICONS[category],
      label: EMPLOYER_IMPACT_CATEGORY_LABELS[category],
    }))
    .filter((badge) => Boolean(badge.icon && badge.label));

  const handleNotesBubbleClick = (event: React.MouseEvent<HTMLElement>, url?: string | null) => {
    if (!url) {
      return;
    }
    event.stopPropagation();
    openExternalUrl(url);
  };

  const handleNotesBubbleKeyDown = (event: React.KeyboardEvent<HTMLElement>, url?: string | null) => {
    if (!url) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      openExternalUrl(url);
    }
  };

  const openStatsPopover = (section?: string) => {
    setSectionToScrollTo(section ?? null);
    setIsStatsPopoverOpen(true);
  };

  const isInteractiveElement = (target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element) {
      return false;
    }
    return Boolean(
      element.closest('button, a, input, select, textarea, [role="menu"], [role="menuitem"], [role="listbox"], [role="option"]'),
    );
  };

  const handleTileClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isInteractiveElement(event.target)) {
      return;
    }
    openStatsPopover();
  };

  const handleTileKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isInteractiveElement(event.target)) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openStatsPopover();
    }
  };

  const tileStateClass =
    currentJobStatus === 'applied' ? ' job-tile--applied' :
    currentJobStatus === 'rejected' ? ' job-tile--rejected' :
    isHighlighted ? ' job-tile--highlighted' :
    isUserCreatedJob ? ' job-tile--user-created' :
    ''

  return (
    <div
      className={`job-tile${tileStateClass}`}
      onClick={handleTileClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleTileKeyDown}
      aria-label={`Open details for ${job?.name ?? 'job'}`}
    >
      {debugFlag && (
        <div className="job-tile-debug-flag" aria-label={debugFlag}>
          {debugFlag}
        </div>
      )}
      {debugInfo !== undefined && (
        <div className="job-debug-icon" onClick={(e) => e.stopPropagation()} role="presentation">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 10.5h-1.5v-5h1.5v5zm0-6.5h-1.5V3.5h1.5V5z"/>
          </svg>
          <div className="job-debug-icon__tooltip">
            <div className="job-debug-icon__prompt-label job-debug-icon__prompt-label--first">Distance from user search</div>
            <div className="job-debug-icon__row"><span>user lat / lon</span><span>{typeof debugInfo.location.userLat === 'number' && typeof debugInfo.location.userLon === 'number' ? `${debugInfo.location.userLat.toFixed(5)}, ${debugInfo.location.userLon.toFixed(5)}` : '—'}</span></div>
            <div className="job-debug-icon__row"><span>job lat / lon</span><span>{typeof debugInfo.location.jobLat === 'number' && typeof debugInfo.location.jobLon === 'number' ? `${debugInfo.location.jobLat.toFixed(5)}, ${debugInfo.location.jobLon.toFixed(5)}` : '—'}</span></div>
            {debugInfo.location.matchedLocation && <div className="job-debug-icon__row"><span>matched location</span><span>{debugInfo.location.matchedLocation}</span></div>}
            {debugInfo.location.locationFallback && <div className="job-debug-icon__row"><span>fallback location</span><span>{debugInfo.location.locationFallback}</span></div>}
            <div className="job-debug-icon__row"><span>job country</span><span>{formatDetectedCountry(debugInfo.location.jobCountry)}</span></div>
            <div className="job-debug-icon__row"><span>search country</span><span>{formatDetectedCountry(debugInfo.location.userCountry)}</span></div>
            <div className="job-debug-icon__row"><span>country penalty</span><span>{debugInfo.location.countryPenalty}</span></div>
            <div className="job-debug-icon__row"><span>distance</span><span>{typeof debugInfo.location.distanceMiles === 'number' && typeof debugInfo.location.distanceKm === 'number' ? `${debugInfo.location.distanceMiles.toFixed(1)} mi / ${debugInfo.location.distanceKm.toFixed(1)} km` : 'not calculated'}</span></div>
            <div className="job-debug-icon__row"><span>location score</span><span>{debugInfo.location.locationScore.toFixed(4)}</span></div>
            <div className="job-debug-icon__calculation">{debugInfo.location.calculation}</div>
            <div className="job-debug-icon__row"><span>prompt version</span><span>{debugInfo.promptVersion}</span></div>
            {debugInfo.aiCacheKey && (
              <div className="job-debug-icon__row" style={{ alignItems: 'flex-start' }}>
                <span>AI lookup key</span>
                <span style={{ wordBreak: 'break-all', textAlign: 'right' }}>{debugInfo.aiCacheKey}</span>
              </div>
            )}
            <div className="job-debug-icon__prompt-label">AI search prompt</div>
            <div className="job-debug-icon__prompt">
              {debugInfo.aiPrompt?.trim() || 'Not saved for legacy company data.'}
            </div>
          </div>
        </div>
      )}
      {(isUserCreatedJob || currentJobStatus !== 'none' || (Array.isArray(companyTagColors) && companyTagColors.length > 0)) && (
        <div className="job-tile-flags" aria-hidden="true">
          {isUserCreatedJob && (
            <span className="job-tile-status-badge job-tile-status-badge--user-created">user created</span>
          )}
          {currentJobStatus !== 'none' && (
            <span className={`job-tile-status-badge job-tile-status-badge--${currentJobStatus}`}>
              {currentJobStatus}
            </span>
          )}
          {Array.isArray(companyTagColors) && companyTagColors.map((color) => (
            <span key={color} className={`job-tile-flag job-tile-flag--${color}`} />
          ))}
        </div>
      )}
      {typeof companyUserNote?.userScore === 'number' && (
        <div className={`job-tile-score-flag job-tile-score-flag--${getUserScoreBand(companyUserNote.userScore)}`} aria-label={`Company score: ${companyUserNote.userScore}`}>
          {companyUserNote.userScore}
        </div>
      )}
      <div className="job-tile-fixed-layout">
        <div className="job-tile-header">
          <div className="job-title-row">
            <h2 className={`job-title${hasReadCompletionAwarded ? ' job-title--viewed' : ''}`}>{job?.name || 'Job Title'}</h2>
          </div>
          <JobTileDropdown
            job={job}
            resumeId={resumeId}
            resumeText={resumeText}
            resumeDisplayName={resumeDisplayName}
            selectedResumeIds={selectedResumeIds}
            resumeCatalogById={resumeCatalogById}
            onRunAudit={handleRunAudit}
            canRunAudit={Boolean(onAuditRequest) && !auditLoading && !isAuditComplete}
            auditMenuLabel={auditLoading ? 'Running audit…' : isAuditComplete ? 'Audit complete' : auditNeedsRetry ? 'Retry audit' : 'Run audit'}
            onRerollAi={searchDebugEnabled ? handleRerollAi : undefined}
            canRerollAi={Boolean(searchDebugEnabled && onRerollAiRequest) && !rerollLoading}
            rerollMenuLabel={rerollLoading ? 'Re-rolling AI…' : rerollError ? 'Retry AI re-roll' : 'Re-roll AI scores'}
            onHideJob={onHideJob}
            onHideCompany={onHideCompany}
            isHighlighted={Boolean(isHighlighted)}
            onToggleHighlightJob={() => onToggleHighlightJob?.(job?.source_url)}
            companyTagColors={companyTagColors}
            onSetCompanyTagColors={onSetCompanyTagColors}
          />
        </div>

        <div className="job-meta">
          <p className="job-company"><strong>Company:</strong> {job?.company_name || 'Company Name'}</p>
          <p className="job-location"><strong>Location:</strong> {job?.location || 'Location'}</p>
          <p className="job-type"><strong>Type:</strong> {job?.type || 'Full-time'}</p>
          {job?.remote && <p className="job-remote"><strong>Remote:</strong> {resolveRemoteDisplay(job.remote, job?.location)}</p>}
        </div>

        <div className="job-text-block">
          {hasCompanyUserNotes && (
            <div
              className={`job-user-notes${companyNoteLink ? ' job-user-notes--link' : ''}`}
              onClick={(event) => handleNotesBubbleClick(event, companyNoteLink)}
              onKeyDown={(event) => handleNotesBubbleKeyDown(event, companyNoteLink)}
              role={companyNoteLink ? 'button' : undefined}
              tabIndex={companyNoteLink ? 0 : undefined}
              title={companyNoteLink ? `Open link: ${companyNoteLink}` : undefined}
            >
              <p className="job-user-notes-kind">Company notes</p>
              {companyUserNote?.notes && (
                <p className="job-user-notes-text">{companyUserNote.notes}</p>
              )}
            </div>
          )}

          {hasJobUserNotes && (
            <div
              className={`job-user-notes${jobNoteLink ? ' job-user-notes--link' : ''}`}
              onClick={(event) => handleNotesBubbleClick(event, jobNoteLink)}
              onKeyDown={(event) => handleNotesBubbleKeyDown(event, jobNoteLink)}
              role={jobNoteLink ? 'button' : undefined}
              tabIndex={jobNoteLink ? 0 : undefined}
              title={jobNoteLink ? `Open link: ${jobNoteLink}` : undefined}
            >
              <p className="job-user-notes-kind">Job notes</p>
              {jobUserNote?.userScore !== null && jobUserNote?.userScore !== undefined && (
                <span className={`job-user-score-badge job-user-score-badge--${getUserScoreBand(jobUserNote.userScore)}`}>
                  Job score: {jobUserNote.userScore}/100
                </span>
              )}
              {jobUserNote?.notes && (
                <p className="job-user-notes-text">{jobUserNote.notes}</p>
              )}
            </div>
          )}
          <p className="job-description">{job?.description || auditTooltip}</p>
          {job?.ai_summary && <p className="job-summary"><em>{job.ai_summary}</em></p>}
        </div>

        {scores && (
          <div className="job-scores">
            <div className="scores-header">
              <strong>Match Scores:</strong>
              {normalizedTotalScore !== undefined && <span className="total-score">Total: {formatScore(normalizedTotalScore)}%</span>}
            </div>

            <div className="score-bubbles-row">
              {String(resumeText ?? '').trim().length > 0 && (
              <div
                className="score-bubble"
                style={getScoreColors(scores?.resume)}
              >
                <span className="score-bubble-label">Resume</span>
                <span className="score-bubble-value">{formatScore(scores.resume)}%</span>
                <span className="score-bubble-tooltip">{resumeTooltip}</span>
              </div>
              )}

              <div
                className="score-bubble score-bubble--impact"
                style={getScoreColors(displayedImpactScore)}
                onClick={(e) => { e.stopPropagation(); openStatsPopover('impact'); }}
              >
                <span className="score-bubble-label">Impact</span>
                <span className="score-bubble-value">{displayedImpactScore !== undefined ? formatScore(displayedImpactScore) + '%' : '—'}</span>
                <span className="score-bubble-tooltip">{impactTooltip}</span>
              </div>

              <div
                className="score-bubble"
                style={getScoreColors(displayedQualityOfLifeScore)}
                onClick={(e) => { e.stopPropagation(); openStatsPopover('qol'); }}
              >
                <span className="score-bubble-label">QoL</span>
                <span className="score-bubble-value">{displayedQualityOfLifeScore !== undefined ? formatScore(displayedQualityOfLifeScore) + '%' : '—'}</span>
                <span className="score-bubble-tooltip">{qualityOfLifeTooltip}</span>
              </div>

              <div
                className="score-bubble"
                style={getScoreColors(scores?.location)}
              >
                <span className="score-bubble-label">Location</span>
                <span className="score-bubble-value">{formatScore(scores.location)}%</span>
                <span className="score-bubble-tooltip">{locationTooltip}</span>
              </div>

              <div
                className="score-bubble"
                style={getScoreColors(scores?.fresh)}
              >
                <span className="score-bubble-label">Fresh</span>
                <span className="score-bubble-value">{formatScore(scores.fresh)}%</span>
                <span className="score-bubble-tooltip">{freshTooltip}</span>
              </div>

              <div
                className="score-bubble score-bubble--audit"
                style={getScoreColors(displayedAuditScore)}
                onClick={(e) => { e.stopPropagation(); openStatsPopover('audit'); }}
              >
                <span className="score-bubble-label">Audit</span>
                <span className="score-bubble-value">
                  {auditLoading ? '⏳…' : displayedAuditScore !== undefined ? formatScore(displayedAuditScore) + '%' : '—'}
                </span>
                <span className="score-bubble-tooltip">{auditTooltip}</span>
              </div>
            </div>

            <div className="job-tile-actions-row job-tile-actions-row--compact">
              <span className="job-link-source">{sourceHost}</span>
              <div className="job-tile-actions-row__right">
                {searchDebugEnabled && (
                  <span
                    className={`employer-impact-badge-eligibility${wrapper?.isEligibleForEmployerImpactBadges ? ' employer-impact-badge-eligibility--eligible' : ' employer-impact-badge-eligibility--ineligible'}`}
                    tabIndex={0}
                  >
                    <span aria-hidden="true">{wrapper?.isEligibleForEmployerImpactBadges ? '✓' : '×'}</span>
                    <span className="employer-impact-badge-eligibility__tooltip">
                      {wrapper?.employerImpactBadgeEligibilityReason ?? 'Badge eligibility unavailable'}
                    </span>
                  </span>
                )}
                {JOB_TYPE_CLASSIFICATION_UI_ENABLED && (
                  <div className="job-classification-panel" aria-label="Job classifications">
                    <div className="job-classification-panel__labels">
                      {classificationLabels.length > 0 ? (
                        classificationLabels.map((label) => (
                          <span
                            key={label}
                            className={`job-classification-label${label === primaryClassification ? ' job-classification-label--primary' : ''}`}
                            title={label}
                          >
                            {formatClassificationLabel(label)}
                          </span>
                        ))
                      ) : (
                        <span className="job-classification-label job-classification-label--empty">Unclassified</span>
                      )}
                    </div>
                  </div>
                )}
                {employerImpactCategoryBadges.length > 0 && (
                  <div className="employer-impact-category-panel" aria-label="Employer impact categories">
                    {employerImpactCategoryBadges.map(({ category, icon, label }) => (
                      <span key={category} className="employer-impact-category-icon" tabIndex={0}>
                        <span aria-hidden="true">{icon}</span>
                        <span className="employer-impact-category-icon__tooltip">{label}</span>
                      </span>
                    ))}
                  </div>
                )}
                {lastScrapedDisplay && (
                  <span className="job-tile-last-updated" title={job?.last_scraped_at ? new Date(job.last_scraped_at).toISOString() : undefined}>
                    Updated {lastScrapedDisplay}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {!scores && (
          <div className="job-tile-actions-row job-tile-actions-row--compact">
            <span className="job-link-source">{sourceHost}</span>
            <div className="job-tile-actions-row__right">
              {searchDebugEnabled && (
                <span
                  className={`employer-impact-badge-eligibility${wrapper?.isEligibleForEmployerImpactBadges ? ' employer-impact-badge-eligibility--eligible' : ' employer-impact-badge-eligibility--ineligible'}`}
                  tabIndex={0}
                >
                  <span aria-hidden="true">{wrapper?.isEligibleForEmployerImpactBadges ? '✓' : '×'}</span>
                  <span className="employer-impact-badge-eligibility__tooltip">
                    {wrapper?.employerImpactBadgeEligibilityReason ?? 'Badge eligibility unavailable'}
                  </span>
                </span>
              )}
              {JOB_TYPE_CLASSIFICATION_UI_ENABLED && (
                <div className="job-classification-panel" aria-label="Job classifications">
                  <div className="job-classification-panel__labels">
                    {classificationLabels.length > 0 ? (
                      classificationLabels.map((label) => (
                        <span
                          key={label}
                          className={`job-classification-label${label === primaryClassification ? ' job-classification-label--primary' : ''}`}
                          title={label}
                        >
                          {formatClassificationLabel(label)}
                        </span>
                      ))
                    ) : (
                      <span className="job-classification-label job-classification-label--empty">Unclassified</span>
                    )}
                  </div>
                </div>
              )}
              {employerImpactCategoryBadges.length > 0 && (
                <div className="employer-impact-category-panel" aria-label="Employer impact categories">
                  {employerImpactCategoryBadges.map(({ category, icon, label }) => (
                    <span key={category} className="employer-impact-category-icon" tabIndex={0}>
                      <span aria-hidden="true">{icon}</span>
                      <span className="employer-impact-category-icon__tooltip">{label}</span>
                    </span>
                  ))}
                </div>
              )}
              {lastScrapedDisplay && (
                <span className="job-tile-last-updated" title={job?.last_scraped_at ? new Date(job.last_scraped_at).toISOString() : undefined}>
                  Updated {lastScrapedDisplay}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {ReactDOM.createPortal(
        <JobTileStatsPopover
          isOpen={isStatsPopoverOpen}
          onClose={() => { setIsStatsPopoverOpen(false); setSectionToScrollTo(null); }}
          sectionToScrollTo={sectionToScrollTo}
          isUserCreatedJob={isUserCreatedJob}
          jobName={job?.name}
          jobSourceUrl={job?.source_url}
          companyName={job?.company_name}
          location={job?.location}
          jobType={job?.type}
          remote={job?.remote}
          jobDescription={job?.description}
          jobSummary={job?.ai_summary}
          totalScore={normalizedTotalScore}
          resumeScore={scores?.resume}
          impactScore={displayedImpactScore}
          qualityOfLifeScore={displayedQualityOfLifeScore}
          locationScore={scores?.location}
          freshScore={scores?.fresh}
          auditScore={displayedAuditScore}
          jobStatusRecord={jobStatusRecord}
          impactSummary={resolvedImpactSummary}
          qualityOfLifeSummary={resolvedQualityOfLifeSummary}
          fullAuditText={getFullAuditText()}
          jobUserNote={jobUserNote}
          companyUserNote={companyUserNote}
          companyTagColors={companyTagColors}
          onSaveUserNote={onSaveUserNote}
          onClearUserNote={onClearUserNote}
          onSaveCompanyUserNote={onSaveCompanyUserNote}
          onClearCompanyUserNote={onClearCompanyUserNote}
          onSetCompanyTagColors={onSetCompanyTagColors}
          onSetJobStatus={onSetJobStatus}
          onAwardReadCompletion={onAwardReadCompletion}
          resumeId={resumeId}
          resumeText={resumeText}
          resumeDisplayName={resumeDisplayName}
          selectedResumeIds={selectedResumeIds}
          resumeCatalogById={resumeCatalogById}
          onRunAudit={handleRunAudit}
          canRunAudit={Boolean(onAuditRequest) && !auditLoading && !isAuditComplete}
          auditMenuLabel={auditLoading ? 'Running audit…' : isAuditComplete ? 'Audit complete' : auditNeedsRetry ? 'Retry audit' : 'Run audit'}
          onHideJob={onHideJob}
          onHideCompany={onHideCompany}
          isHighlighted={Boolean(isHighlighted)}
          onToggleHighlightJob={() => onToggleHighlightJob?.(job?.source_url)}
          onSaveUserCreatedJobDetails={
            job?.source_url && onSaveUserCreatedJobDetails
              ? (updates) => onSaveUserCreatedJobDetails(job.source_url!, updates)
              : undefined
          }
        />,
        document.body,
      )}
    </div>
  );
};

export default JobTile;
