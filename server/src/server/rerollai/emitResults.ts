import type { Socket } from 'socket.io';

import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';

interface AuditResult {
  auditScore: number;
  auditText: string;
  error?: string;
}

interface QualityOfLifeResult {
  employeeQualityOfLifeScore: number;
  employeeQualityOfLifeSummary: string;
  error?: string;
}

interface ImpactResult {
  impactScore: number;
  impactSummary: string;
  error?: string;
}

function buildLogKey(job: ScrapedJob): string {
  return `${String(job.source_url ?? '').trim() || String(job.name ?? '').trim().toLowerCase()}::${String(job.company_name ?? '').trim().toLowerCase()}::${String(job.name ?? '').trim().toLowerCase()}::${String(job.location ?? '').trim().toLowerCase()}`;
}

export function emitCompanyRerollResults(
  socket: Socket,
  companyJobs: ScrapedJob[],
  auditResult: AuditResult,
  qualityOfLifeResult: QualityOfLifeResult,
  impactResult: ImpactResult,
): void {
  for (const job of companyJobs) {
    const sourceUrl = String(job.source_url ?? '').trim();
    if (!sourceUrl) {
      continue;
    }

    socket.emit('job:audit:result', {
      source_url: sourceUrl,
      ...auditResult,
    });

    socket.emit('job:qualityOfLife:result', {
      source_url: sourceUrl,
      ...qualityOfLifeResult,
    });

    socket.emit('job:impact:result', {
      source_url: sourceUrl,
      ai_impact_score: impactResult.impactScore,
      ai_impact_summary: impactResult.impactSummary,
      impactScore: impactResult.impactScore,
      impactSummary: impactResult.impactSummary,
      error: impactResult.error,
    });

    console.log(
      `[SearchDebug] Emitted refreshed AI result for job=${sourceUrl} ` +
      `key=${buildLogKey(job)} ` +
      `summary=${String(job.scrapedEmployer?.ai_summary ?? '').slice(0, 120)} impact=${String(job.scrapedEmployer?.ai_impact_summary ?? '').slice(0, 120)} qol=${String(job.scrapedEmployer?.employeeQualityOfLifeSummary ?? '').slice(0, 120)}`,
    );
  }
}
