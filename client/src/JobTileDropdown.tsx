import React, { useEffect, useRef, useState } from 'react';
import GenericPopover from './GenericPopover';
import type { CompanyTagColor } from './ClientSaveLoad';

const TAG_COLOR_OPTIONS: Array<{ color: CompanyTagColor; label: string; bg: string; border: string }> = [
  { color: 'red',    label: 'Red',    bg: '#fef2f2', border: '#fca5a5' },
  { color: 'orange', label: 'Orange', bg: '#fff7ed', border: '#fdba74' },
  { color: 'yellow', label: 'Yellow', bg: '#fefce8', border: '#fde047' },
  { color: 'green',  label: 'Green',  bg: '#ecfdf5', border: '#86efac' },
  { color: 'blue',   label: 'Blue',   bg: '#eff6ff', border: '#93c5fd' },
  { color: 'purple', label: 'Purple', bg: '#f5f3ff', border: '#c4b5fd' },
];

interface Job {
  name?: string;
  company_name?: string;
  location?: string;
  remote?: string;
  description?: string;
  type?: string;
  source_url?: string;
  ai_summary?: string;
}

interface ResumeCatalogEntry {
  displayName?: string;
  name?: string;
  id?: string;
}

interface JobTileDropdownProps {
  job?: Job;
  className?: string;
  resumeId?: string;
  resumeText?: string;
  resumeDisplayName?: string;
  selectedResumeIds?: string[];
  resumeCatalogById?: Record<string, ResumeCatalogEntry>;
  onRunAudit?: () => void;
  canRunAudit?: boolean;
  auditMenuLabel?: string;
  onHideJob?: (jobUrl?: string) => void;
  onHideCompany?: (companyName?: string) => void;
  isHighlighted?: boolean;
  onToggleHighlightJob?: () => void;
  companyTagColors?: CompanyTagColor[];
  onSetCompanyTagColors?: (colors: CompanyTagColor[]) => void;
}

function getSourceLabel(sourceUrl?: string): string {
  if (!sourceUrl) return 'Unknown source';
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return sourceUrl;
  }
}

const JobTileDropdown: React.FC<JobTileDropdownProps> = ({
  job,
  className,
  resumeId,
  resumeText: uploadedResumeText,
  resumeDisplayName: uploadedResumeName,
  selectedResumeIds,
  resumeCatalogById,
  onRunAudit,
  canRunAudit,
  auditMenuLabel,
  onHideJob,
  onHideCompany,
  isHighlighted,
  onToggleHighlightJob,
  companyTagColors,
  onSetCompanyTagColors,
}) => {
  const [open, setOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [deepResearchPopoverOpen, setDeepResearchPopoverOpen] = useState(false);
  const [deepResearchPopoverTitle, setDeepResearchPopoverTitle] = useState('');
  const [deepResearchPopoverText, setDeepResearchPopoverText] = useState('');
  const [deepResearchCopyStatus, setDeepResearchCopyStatus] = useState('');
  const [deepResearchPromptStatus, setDeepResearchPromptStatus] = useState('');
  const [deepResearchJobStatus, setDeepResearchJobStatus] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const deepResearchTextAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const showStatus = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    message: string,
  ) => {
    setter(message);
    setTimeout(() => setter(''), 2500);
  };

  const openDeepResearchPopover = (title: string, text: string) => {
    setDeepResearchPopoverTitle(title);
    setDeepResearchPopoverText(text);
    setDeepResearchCopyStatus('');
    setDeepResearchPopoverOpen(true);
    window.setTimeout(() => {
      deepResearchTextAreaRef.current?.focus();
      deepResearchTextAreaRef.current?.select();
    }, 0);
  };

  const handleCopyDeepResearchPopoverText = async () => {
    if (!deepResearchPopoverText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(deepResearchPopoverText);
      setDeepResearchCopyStatus('Copied to clipboard.');
    } catch {
      deepResearchTextAreaRef.current?.focus();
      deepResearchTextAreaRef.current?.select();
      setDeepResearchCopyStatus('Clipboard blocked. Press Cmd+C to copy.');
    }
  };

  const handleCopyDeepResearchPrompt = async () => {
    const company = job?.company_name || 'Unknown Company';
    const title = job?.name || 'Unknown Role';
    const location = job?.location || 'Unknown Location';
    const remote = job?.remote || '';
    const url = job?.source_url || '';
    const sourceLabel = getSourceLabel(job?.source_url);
    const description = job?.description || '';

    const remoteNote = remote ? `\nRemote preference: ${remote}` : '';
    const urlNote = url ? `\nJob posting URL: ${url} (source: ${sourceLabel})` : '';

    const prompt = `You are a job-seeker's due-diligence assistant. I am considering applying to the following role and need a thorough background check on the company before I invest time in the application.

## Role Details
- **Company:** ${company}
- **Title:** ${title}
- **Location:** ${location}${remoteNote}${urlNote}

## Job Description (for context)
${description}

---

## Research Tasks

Please investigate the following and provide a structured report:

1. **Company Overview**
   - What does the company do? What industry and stage (startup, scale-up, public, non-profit, government, etc.)?
   - Approximate headcount and founding year.

2. **Financial Health & Stability**
   - Is the company profitable or venture-funded? Recent funding rounds or revenue signals.
   - Any signs of financial distress, layoffs, or downsizing in the past 12–18 months?

3. **Reputation & Culture**
   - Glassdoor / Blind / LinkedIn review sentiment. Common praise and complaints.
   - Any notable leadership controversies, lawsuits, or press scandals?

4. **Mission Alignment & Impact**
   - Does the company's stated mission match its actions? Any greenwashing or impact-washing red flags?

5. **Role Legitimacy**
   - Does this job posting appear genuine? Any signals it could be a ghost listing, scam, or role already filled?
   - Is the listed location consistent with the company's known offices?

6. **Red Flags Summary**
   - List any significant concerns I should investigate further before applying.

7. **Overall Verdict**
   - On a scale of Low / Medium / High, rate the risk of this company being a poor employer.
   - Should I proceed with the application, proceed with caution, or skip?

Be direct and honest. Do not soften negative findings.`;

    openDeepResearchPopover('Deep Research AI Prompt', prompt);
    showStatus(setDeepResearchPromptStatus, 'Opened');
    setOpen(false);
  };

  const handleCopyDeepReseachJobTemplate = async () => {
    const company = job?.company_name || 'Unknown Company';
    const title = job?.name || 'Unknown Role';
    const location = job?.location || 'Unknown Location';
    const remote = job?.remote || '';
    const url = job?.source_url || '';
    const sourceLabel = getSourceLabel(job?.source_url);
    const description = job?.description || '';

    const remoteNote = remote ? `\nRemote preference: ${remote}` : '';
    const urlNote = url ? `\nJob posting URL: ${url} (source: ${sourceLabel})` : '';

    // Resolve which resume to use
    const activeResumeId = resumeId || selectedResumeIds?.[0];
    let resumeDisplayName = uploadedResumeName || 'Selected Resume';
    let resumeText: string | null = uploadedResumeText || null;

    if (!resumeText && activeResumeId && resumeCatalogById) {
      const entry = resumeCatalogById[activeResumeId];
      if (entry) {
        resumeDisplayName = entry.displayName || entry.name || activeResumeId;
      }
    }

    if (!resumeText && activeResumeId) {
      try {
        const res = await fetch(
          `/api/resumes?resumeId=${encodeURIComponent(activeResumeId)}&includeText=1`,
        );
        if (res.ok) {
          const data = await res.json();
          resumeText = data?.text ?? data?.resumeText ?? null;
        }
      } catch {
        // fall through to placeholder
      }
    }

    const resumeSection = resumeText
      ? `## My Resume (${resumeDisplayName})
\`\`\`
${resumeText}
\`\`\``
      : `## My Resume
*(No resume was provided. Where tasks below require resume content, note what is missing and explain what I should supply before you can complete that section.)*`;

    const prompt = `You are an expert career coach, resume writer, and hiring consultant. I am preparing a full application package for the role below. Use the job description and my resume to complete all tasks.

## Role Details
- **Company:** ${company}
- **Title:** ${title}
- **Location:** ${location}${remoteNote}${urlNote}

## Job Description
${description}

---

${resumeSection}

---

## Tasks — complete every section below

### 1. Company & Role Research
- One-paragraph company overview (industry, stage, mission, size).
- Key business challenges this role is likely hired to solve.
- Culture signals from the job description language.

### 2. Role Analysis
- Extract the top 8–10 required skills/competencies from the job description.
- Identify any implicit requirements not explicitly stated.
- Flag any requirements that seem like stretch goals vs. hard gates.

### 3. Resume Gap Analysis
- Compare my resume against the role requirements.
- List: (a) strong matches, (b) partial matches I should highlight differently, (c) gaps I need to address or acknowledge.

### 4. Tailored Resume Rewrite
- Rewrite the most relevant 3–5 bullet points from my resume to directly mirror language in this job description.
- Preserve factual accuracy — do not invent achievements.
- Output as a ready-to-paste block.

### 5. Cover Letter
- Write a compelling, specific cover letter (300–400 words).
- Open with a hook tied to the company's mission or a recent company development.
- Middle paragraphs: connect 2–3 of my concrete achievements to the top role requirements.
- Close with a confident, non-desperate call to action.
- Do not use generic filler phrases like "I am a passionate team player."

### 6. ATS Keyword Mapping
- List the high-value keywords and phrases from the job description that should appear in my resume and cover letter.
- Flag any that are currently missing from my materials.

### 7. Interview Preparation
- Predict the 5 most likely interview questions for this specific role.
- For each question, draft a strong answer grounded in my resume experience using the STAR format where applicable.
- Include 3 sharp questions I should ask the interviewer that demonstrate strategic thinking.

### 8. Application Strategy
- Recommended application channels beyond the listed URL (referral networks, LinkedIn, direct outreach).
- One concrete suggestion for standing out (portfolio piece, cold outreach angle, etc.).

Be specific, direct, and high quality. Treat this as a real application I intend to submit.`;

    openDeepResearchPopover('Deep Research AI Template', prompt);
    showStatus(setDeepResearchJobStatus, 'Opened');
    setOpen(false);
  };

  const handleHideJob = () => {
    onHideJob?.(job?.source_url);
    setOpen(false);
  };

  const handleHideCompany = () => {
    onHideCompany?.(job?.company_name);
    setOpen(false);
  };

  const handleRunAudit = () => {
    if (!canRunAudit) {
      return;
    }
    onRunAudit?.();
    setOpen(false);
  };

  const handleToggleHighlight = () => {
    onToggleHighlightJob?.();
    setOpen(false);
  };

  const companyName = job?.company_name?.trim() || 'this company';

  return (
    <>
      <div className={`job-tile-dropdown${className ? ` ${className}` : ''}`} ref={containerRef}>
      <button
        className={`job-tile-dropdown-trigger${className ? ' job-tile-dropdown-trigger--text job-stats-open-listing-btn' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Job options"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {className ? 'Menu' : (
          <svg viewBox="0 0 4 16" width="4" height="16" fill="currentColor" aria-hidden="true">
            <circle cx="2" cy="2" r="1.5"/>
            <circle cx="2" cy="8" r="1.5"/>
            <circle cx="2" cy="14" r="1.5"/>
          </svg>
        )}
      </button>

      {open && (
        <div className="job-tile-dropdown-menu" role="menu">
          <button
            className="job-tile-dropdown-item"
            role="menuitem"
            onClick={handleCopyDeepResearchPrompt}
          >
            <span className="dropdown-item-icon">🔍</span>
            <span className="dropdown-item-label">Deep research AI prompt</span>
            {deepResearchPromptStatus && (
              <span className="dropdown-item-status">{deepResearchPromptStatus}</span>
            )}
          </button>

          <button
            className="job-tile-dropdown-item"
            role="menuitem"
            onClick={handleCopyDeepReseachJobTemplate}
          >
            <span className="dropdown-item-icon">🧰</span>
            <span className="dropdown-item-label">Deep Research AI Template</span>
            {deepResearchJobStatus && (
              <span className="dropdown-item-status">{deepResearchJobStatus}</span>
            )}
          </button>

          <button
            className="job-tile-dropdown-item"
            role="menuitem"
            onClick={handleRunAudit}
            disabled={!canRunAudit}
            title={canRunAudit ? 'Run AI audit for this job' : 'Audit unavailable'}
          >
            <span className="dropdown-item-icon">🤖</span>
            <span className="dropdown-item-label">{auditMenuLabel || 'Run audit'}</span>
          </button>

          <div className="job-tile-dropdown-divider" role="separator" />

          {onSetCompanyTagColors && (
            <>
              <button
                type="button"
                className="job-tile-dropdown-item"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setTagsOpen(v => !v); }}
              >
                <span className="dropdown-item-icon">🏷️</span>
                <span className="dropdown-item-label">Tags</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 'auto' }}>{tagsOpen ? '▲' : '▼'}</span>
              </button>
              {tagsOpen && (
                <div className="job-tile-dropdown-tags">
                  {TAG_COLOR_OPTIONS.map(({ color, label, bg, border }) => {
                    const active = Array.isArray(companyTagColors) && companyTagColors.includes(color);
                    const next = active
                      ? (companyTagColors ?? []).filter(c => c !== color)
                      : [...(companyTagColors ?? []), color];
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`job-tile-dropdown-tag-btn${active ? ' job-tile-dropdown-tag-btn--active' : ''}`}
                        style={{ background: bg, borderColor: border }}
                        onClick={(e) => { e.stopPropagation(); onSetCompanyTagColors(next as CompanyTagColor[]); }}
                        title={label}
                        aria-pressed={active}
                      >
                        {active && <span className="job-tile-dropdown-tag-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <button
            className="job-tile-dropdown-item"
            role="menuitem"
            onClick={handleToggleHighlight}
          >
            <span className="dropdown-item-icon">⭐</span>
            <span className="dropdown-item-label">{isHighlighted ? 'Remove highlighted job' : 'Mark as highlighted job'}</span>
          </button>

          <button
            className="job-tile-dropdown-item"
            role="menuitem"
            onClick={handleHideJob}
          >
            <span className="dropdown-item-icon">🙈</span>
            <span className="dropdown-item-label">Hide this job</span>
          </button>

          <button
            className="job-tile-dropdown-item"
            role="menuitem"
            onClick={handleHideCompany}
          >
            <span className="dropdown-item-icon">🏢</span>
            <span className="dropdown-item-label">Hide all jobs from {companyName}</span>
          </button>
        </div>
      )}
      </div>

      <GenericPopover
        isOpen={deepResearchPopoverOpen}
        onClose={() => setDeepResearchPopoverOpen(false)}
        title={deepResearchPopoverTitle}
        className="audit-fullscreen-popover"
        headerActions={(
          <button type="button" className="open-corpus-btn" style={{ marginTop: 0 }} onClick={handleCopyDeepResearchPopoverText}>
            Copy text
          </button>
        )}
      >
        <div style={{ paddingBottom: '10px', color: '#334155', fontSize: '0.92rem' }}>
          Review the generated text below, then copy it into your AI tool.
          {deepResearchCopyStatus ? <span style={{ marginLeft: '8px', color: '#0f766e', fontWeight: 600 }}>{deepResearchCopyStatus}</span> : null}
        </div>
        <textarea
          ref={deepResearchTextAreaRef}
          readOnly
          spellCheck={false}
          value={deepResearchPopoverText}
          style={{
            width: '100%',
            minHeight: '60vh',
            resize: 'vertical',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            padding: '12px',
            fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
            fontSize: '12px',
            lineHeight: 1.45,
            color: '#0f172a',
            background: '#f8fafc',
          }}
        />
      </GenericPopover>
    </>
  );
};

export default JobTileDropdown;
