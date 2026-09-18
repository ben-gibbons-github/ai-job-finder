import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';
import {
  getCurrentCompanyAiScores,
  runUnifiedCompanyAiAsync,
} from '../../searching/SearchCompanyAiUnified.js';

import { emitCompanyRerollResults } from './emitResults.js';
import type { RerollCallback, RerollCallbackResponse } from './types.js';
import type { Socket } from 'socket.io';

function buildLogKey(job: ScrapedJob): string {
  return `${String(job.source_url ?? '').trim() || String(job.name ?? '').trim().toLowerCase()}::${String(job.company_name ?? '').trim().toLowerCase()}::${String(job.name ?? '').trim().toLowerCase()}::${String(job.location ?? '').trim().toLowerCase()}`;
}

export async function runRerollForCompany(
  socket: Socket,
  seedJob: ScrapedJob,
  companyJobs: ScrapedJob[],
  representativeJob: ScrapedJob,
  callback?: RerollCallback,
): Promise<void> {
  const unified = await runUnifiedCompanyAiAsync(representativeJob, true, true);
  if (unified.error) {
    callback?.({
      auditScore: 0,
      auditText: '',
      error: `Debug AI re-roll failed: ${unified.error}`,
    });
    console.error(
      `[SearchDebug] Unified AI refresh failed for company=${String(representativeJob.company_name ?? '?')}: ${unified.error}`,
    );
    return;
  }

  if (!unified.error && representativeJob.scrapedEmployer) {
    const refreshedEmployer = representativeJob.scrapedEmployer;
    console.log(
      `[SearchDebug] AI re-roll refreshed employer for company=${String(representativeJob.company_name ?? '?')} ` +
      `key=${buildLogKey(representativeJob)} ` +
      `summary=${String(refreshedEmployer.ai_summary ?? '').slice(0, 120)} impact=${String(refreshedEmployer.ai_impact_summary ?? '').slice(0, 120)} qol=${String(refreshedEmployer.employeeQualityOfLifeSummary ?? '').slice(0, 120)}`,
    );
    for (const job of companyJobs) {
      const prevSummary = String(job.scrapedEmployer?.ai_summary ?? '').slice(0, 120);
      job.scrapedEmployer = refreshedEmployer;
      console.log(
        `[SearchDebug] Re-roll assigned refreshed employer to job=${String(job.source_url ?? '').trim() || job.name} ` +
        `prevSummary=${prevSummary} nextSummary=${String(job.scrapedEmployer?.ai_summary ?? '').slice(0, 120)}`,
      );
    }
  }

  const currentScores = getCurrentCompanyAiScores(representativeJob);

  const auditResult = {
    auditScore: currentScores.auditScore,
    auditText: currentScores.auditText,
    ...(unified.error ? { error: unified.error } : {}),
  };
  const qualityOfLifeResult = {
    employeeQualityOfLifeScore: currentScores.qualityOfLifeScore,
    employeeQualityOfLifeSummary: currentScores.qualityOfLifeSummary,
    ...(unified.error ? { error: unified.error } : {}),
  };
  const impactResult = {
    impactScore: currentScores.impactScore,
    impactSummary: currentScores.impactSummary,
    ...(unified.error ? { error: unified.error } : {}),
  };

  console.log(
    `[SearchDebug] Re-roll finished for company=${String(representativeJob.company_name ?? '?')} ` +
    `audit=${auditResult.auditScore} impact=${impactResult.impactScore} qol=${qualityOfLifeResult.employeeQualityOfLifeScore} ` +
    `summary=${String(representativeJob.scrapedEmployer?.ai_summary ?? '').slice(0, 120)} ` +
    `impactSummary=${String(representativeJob.scrapedEmployer?.ai_impact_summary ?? '').slice(0, 120)} ` +
    `qolSummary=${String(representativeJob.scrapedEmployer?.employeeQualityOfLifeSummary ?? '').slice(0, 120)}`,
  );

  const callbackPayload: RerollCallbackResponse = {
    auditScore: auditResult.auditScore,
    auditText: auditResult.auditText,
    ...(unified.error ? { error: unified.error } : auditResult.error ? { error: auditResult.error } : {}),
  };
  callback?.(callbackPayload);

  emitCompanyRerollResults(socket, companyJobs, auditResult, qualityOfLifeResult, impactResult);

  console.log(
    `[SearchDebug] Re-rolled AI scores for company=${String(representativeJob.company_name ?? '?')} ` +
    `jobsUpdated=${companyJobs.length} sourceUrlSeed=${String(representativeJob.source_url ?? '?')}`,
  );
}
