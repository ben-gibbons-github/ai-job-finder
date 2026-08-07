import React, { useEffect, useRef, useState } from 'react'

interface AuditResult {
  auditScore: number
  auditText: string
  error?: string
}

interface ImpactResult {
  ai_impact_score: number
  ai_impact_summary: string
  error?: string
}

interface GlobalAIButtonProps {
  resumeText: string
  jobs: any[]
  auditResults: Record<string, AuditResult>
  impactResults: Record<string, ImpactResult>
  showButton?: boolean
  openSignal?: number
}

function formatMultilineBlock(value: string, fallback = 'N/A'): string {
  const trimmed = String(value ?? '').trim()
  return trimmed.length > 0 ? trimmed : fallback
}

const GlobalAIButton: React.FC<GlobalAIButtonProps> = ({ resumeText, jobs, auditResults, impactResults, showButton = true, openSignal = 0 }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [fullText, setFullText] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  const handleOpenAiComparisonCorpus = () => {
    setCopyStatus('')
    const resumeBlock = formatMultilineBlock(
      resumeText,
      'No resume was uploaded. Ask the user to upload a resume and regenerate this corpus.',
    )

    const promptHeader = [
      'AI TASK: Resume-vs-Jobs Deep Comparison',
      '',
      'You are an expert career copilot. Use the resume and all job entries below to identify the best-fit roles.',
      'Instructions:',
      '1) Read the resume carefully, including skills, domain experience, tools, and seniority.',
      '2) Compare the resume against ALL jobs listed below, using the job description + audit report + impact report for each job.',
      '3) Rank the top 25 best-matching jobs and explain why each is a fit.  Prioritize jobs that optimize for quality of life, work / life balance, and mission alignment, as described in the audit and impact reports.',
      '4) For each top match, list skill gaps and concrete resume edits to improve odds.',
      '5) Flag risky jobs using audit red flags and weak mission fit using impact report.',
      '6) End with a practical application plan: apply now, customize resume, or skip.',
      '',
      'Output format:',
      '- Section A: Resume profile summary',
      '- Section B: Top 25 job matches with rationale and risk notes',
      '- Section C: Resume improvements for highest-priority jobs',
      '- Section D: Jobs to avoid and reasons',
      '',
      'RESUME START',
      resumeBlock,
      'RESUME END',
      '',
      'JOBS DATA START',
    ].join('\n')

    const jobBlocks = jobs
      .map((wrapper: any, index: number) => {
        const job = wrapper?.job ?? {}
        const sourceUrl = String(job?.source_url ?? '').trim()
        const auditFromSocket = sourceUrl ? auditResults[sourceUrl] : undefined
        const impactFromSocket = sourceUrl ? impactResults[sourceUrl] : undefined

        const auditScore =
          auditFromSocket?.auditScore ??
          (Number.isFinite(Number(job?.audit_number)) ? Number(job.audit_number) : null)
        const auditText = formatMultilineBlock(
          auditFromSocket?.auditText ?? String(job?.audit_text ?? ''),
          'No audit report available.',
        )
        const impactScoreRaw =
          impactFromSocket?.ai_impact_score ??
          (Number.isFinite(Number(job?.ai_impact_score)) ? Number(job.ai_impact_score) : null)
        const impactSummary = formatMultilineBlock(
          impactFromSocket?.ai_impact_summary ?? String(job?.ai_impact_summary ?? ''),
          'No impact report available.',
        )

        return [
          `JOB #${index + 1}`,
          `Title: ${formatMultilineBlock(String(job?.name ?? ''), 'Unknown')}`,
          `Company: ${formatMultilineBlock(String(job?.company_name ?? ''), 'Unknown')}`,
          `Location: ${formatMultilineBlock(String(job?.location ?? ''), 'Unknown')}`,
          `Remote: ${formatMultilineBlock(String(job?.remote ?? ''), 'Unknown')}`,
          `Type: ${formatMultilineBlock(String(job?.type ?? ''), 'Unknown')}`,
          `Source URL: ${formatMultilineBlock(sourceUrl, 'Unknown')}`,
          `Audit Score (0-100): ${auditScore ?? 'N/A'}`,
          `Impact Score (0-100): ${impactScoreRaw ?? 'N/A'}`,
          'Job Description:',
          formatMultilineBlock(String(job?.description ?? ''), 'No job description provided.'),
          'Job Audit Report:',
          auditText,
          'Job Impact Report:',
          impactSummary,
          '---',
        ].join('\n')
      })
      .join('\n\n')

    const generatedText = [
      promptHeader,
      jobBlocks,
      'JOBS DATA END',
    ].join('\n\n')

    setFullText(generatedText)
    setIsPopoverOpen(true)
    window.setTimeout(() => {
      textAreaRef.current?.focus()
      textAreaRef.current?.select()
    }, 0)
  }

  const handleCopyAll = async () => {
    const value = fullText
    if (!value) {
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus('Copied to clipboard.')
    } catch {
      textAreaRef.current?.focus()
      textAreaRef.current?.select()
      setCopyStatus('Clipboard blocked. Press Cmd+C to copy.')
    }
  }

  useEffect(() => {
    if (openSignal > 0) {
      handleOpenAiComparisonCorpus()
    }
    // openSignal intentionally drives this side effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  return (
    <>
      {showButton && (
        <div className="app-top-actions">
          <button type="button" className="open-corpus-btn" onClick={handleOpenAiComparisonCorpus}>
            Open AI Resume-vs-Jobs Text
          </button>
        </div>
      )}

      {isPopoverOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI resume versus jobs text"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setIsPopoverOpen(false)}
        >
          <div
            style={{
              width: 'min(1100px, 100%)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              boxShadow: '0 24px 80px rgba(2, 6, 23, 0.35)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '14px 16px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <strong style={{ color: '#0f172a' }}>AI Resume-vs-Jobs Corpus</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" className="open-corpus-btn" style={{ marginTop: 0 }} onClick={handleCopyAll}>
                  Copy all text
                </button>
                <button
                  type="button"
                  className="open-corpus-btn"
                  style={{ marginTop: 0 }}
                  onClick={() => setIsPopoverOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', color: '#334155', fontSize: '0.92rem' }}>
              Select all and copy, then paste into your AI tool.
              {copyStatus ? <span style={{ marginLeft: '8px', color: '#0f766e', fontWeight: 600 }}>{copyStatus}</span> : null}
            </div>

            <div style={{ padding: '14px 16px', overflow: 'auto' }}>
              <textarea
                ref={textAreaRef}
                readOnly
                spellCheck={false}
                value={fullText}
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
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default GlobalAIButton
