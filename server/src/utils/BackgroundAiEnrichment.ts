import type { ScrapedJob } from '../scraping/core/ScrapedJob.js';
import type { ScrapedEmployer } from '../scraping/core/ScrapedEmployer.js';
import scrapedEmployerCache from '../scraping/core/ScrapedEmployerCache.js';
import {
  buildUnifiedCompanyAiPrompt,
  getCurrentCompanyAiScores,
  getLlmJobBatchKey,
  runUnifiedCompanyAiAsync,
  UNIFIED_COMPANY_AI_PROMPT_VERSION,
} from '../searching/SearchCompanyAiUnified.js';
import {
  getLlmBatchRequestsFilePath,
  isLlmBatchAsyncEnabled,
  replaceLlmBatchRequests,
} from '../llms/LlmBatchRequestStore.js';
import { clearActiveOperation, setActiveOperation } from '../server/ServerActivityTracker.js';
import { logBackgroundTaskEnd, logBackgroundTaskStart } from './BackgroundTaskTiming.js';

const BACKGROUND_AI_CONCURRENCY = Math.max(
  1,
  Number(process.env.BACKGROUND_AI_CONCURRENCY ?? 2),
);
const BACKGROUND_AI_HEARTBEAT_MS = Math.max(
  5_000,
  Number(process.env.BACKGROUND_AI_HEARTBEAT_MS ?? 30_000),
);

function employerHasAuditData(employer: ScrapedEmployer): boolean {
  return (
    employer.ai_score > 0 ||
    employer.ai_red_flag_score > 0 ||
    String(employer.ai_summary ?? '').trim().length > 0 ||
    String(employer.ai_red_flag_summary ?? '').trim().length > 0
  );
}

function employerHasImpactData(employer: ScrapedEmployer): boolean {
  return (
    employer.ai_impact_score > 0 ||
    String(employer.ai_impact_summary ?? '').trim().length > 0
  );
}

function employerHasQualityOfLifeData(employer: ScrapedEmployer): boolean {
  return (
    employer.employeeQualityOfLifeScore > 0 ||
    String(employer.employeeQualityOfLifeSummary ?? '').trim().length > 0
  );
}

function employerHasAnyAiData(employer: ScrapedEmployer): boolean {
  return employerHasAuditData(employer)
    || employerHasImpactData(employer)
    || employerHasQualityOfLifeData(employer);
}

function getEmployerAiRecords(job: ScrapedJob): ScrapedEmployer[] {
  const records: ScrapedEmployer[] = [];
  if (job.scrapedEmployer) {
    records.push(job.scrapedEmployer);
  }

  const employerName = String(job.scrapedEmployer?.name ?? job.company_name ?? '').trim();
  const cachedEmployer = scrapedEmployerCache.getCachedEmployerByName(employerName);
  if (cachedEmployer) {
    records.push(cachedEmployer);
  }

  return records;
}

function hasAnyAiData(job: ScrapedJob): boolean {
  return getEmployerAiRecords(job).some(employerHasAnyAiData);
}

function hasAuditData(job: ScrapedJob): boolean {
  return getEmployerAiRecords(job).some(employerHasAuditData);
}

function hasImpactData(job: ScrapedJob): boolean {
  return getEmployerAiRecords(job).some(employerHasImpactData);
}

function hasQualityOfLifeData(job: ScrapedJob): boolean {
  return getEmployerAiRecords(job).some(employerHasQualityOfLifeData);
}

function hasCompleteAiData(job: ScrapedJob): boolean {
  return getEmployerAiRecords(job).some(
    (employer) => employerHasAuditData(employer)
      && employerHasImpactData(employer)
      && employerHasQualityOfLifeData(employer),
  );
}

function normalizePromptVersion(value: unknown): string {
  return String(value ?? '').trim() || '1.0';
}

const AI_RECALCULATION_PROMPT_VERSIONS = new Set(['3.0', '4.0']);

function hasLegacyPromptImpactOverThreshold(employer: ScrapedEmployer): boolean {
  return AI_RECALCULATION_PROMPT_VERSIONS.has(normalizePromptVersion(employer.promptVersion))
    && Number.isFinite(Number(employer.ai_impact_score))
    && Number(employer.ai_impact_score) > 60;
}

function needsLegacyPromptRefresh(job: ScrapedJob): boolean {
  return getEmployerAiRecords(job).some(hasLegacyPromptImpactOverThreshold);
}

function needsAiEnrichment(job: ScrapedJob): boolean {
  if (needsLegacyPromptRefresh(job)) {
    return true;
  }

  return !hasCompleteAiData(job);
}

function getEmployerName(job: ScrapedJob): string {
  const fromCompanyName = String(job.company_name ?? '').trim();
  if (fromCompanyName.length > 0) {
    return fromCompanyName;
  }

  const fromScrapedEmployer = String(job.scrapedEmployer?.name ?? '').trim();
  if (fromScrapedEmployer.length > 0) {
    return fromScrapedEmployer;
  }

  return 'Unknown Employer';
}

function normalizeEmployerKey(name: string): string {
  return name.trim().toLowerCase();
}

function isSoftwareTitle(job: ScrapedJob): boolean {
  const title = String(job.name ?? '').trim().toLowerCase();
  return title.includes('software');
}

function summarizePromptVersions(job: ScrapedJob): string {
  const versions = new Set(
    getEmployerAiRecords(job)
      .map((employer) => normalizePromptVersion(employer.promptVersion))
      .filter((value) => value.length > 0),
  );
  return versions.size > 0 ? Array.from(versions).join(',') : 'none';
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}

export function startBackgroundAiEnrichmentJobs(jobs: ScrapedJob[]): void {
  const startedAtMs = Date.now();
  const workerTimingStart = logBackgroundTaskStart('BackgroundAI:worker', {
    totalJobs: jobs.length,
  });
  const employerQueueConcurrency = 1;

  const forcedLegacyRefreshJobs = jobs.filter(needsLegacyPromptRefresh);
  const candidates = jobs.filter(needsAiEnrichment);
  const skippedCompletedJobs = jobs.length - candidates.length;
  if (candidates.length === 0) {
    console.log(
      `[BackgroundAI] Skipping: all ${jobs.length} jobs belong to companies with existing audit/impact/quality-of-life data.`,
    );
    return;
  }

  console.log(
    `[BackgroundAI] Triggered for ${jobs.length} jobs. Enrichment needed for ${candidates.length} jobs (forced legacy prompt refresh=${forcedLegacyRefreshJobs.length}); skipped ${skippedCompletedJobs} jobs whose companies already have AI stats. Concurrency=${employerQueueConcurrency}.`,
  );

  const employerBuckets = new Map<string, { employerName: string; jobs: ScrapedJob[] }>();
  for (const job of candidates) {
    const employerName = getEmployerName(job);
    const key = normalizeEmployerKey(employerName);
    const existing = employerBuckets.get(key);
    if (existing) {
      existing.jobs.push(job);
      continue;
    }

    employerBuckets.set(key, { employerName, jobs: [job] });
  }

  const sortedEmployerBuckets = Array.from(employerBuckets.values()).sort(
    (a, b) => b.jobs.length - a.jobs.length,
  );
  const representativeJobs = sortedEmployerBuckets.map((bucket) => bucket.jobs[0]);
  const totalEmployers = sortedEmployerBuckets.length;

  if (isLlmBatchAsyncEnabled()) {
    void (async () => {
      const batchExportStart = logBackgroundTaskStart('BackgroundAI:batchExport', {
        representativeJobs: representativeJobs.length,
      });
      const requests = representativeJobs.map((job) => ({
        key: getLlmJobBatchKey(job),
        text: buildUnifiedCompanyAiPrompt(job),
        promptVersion: UNIFIED_COMPANY_AI_PROMPT_VERSION,
      }));

      await replaceLlmBatchRequests(requests);
      logBackgroundTaskEnd('BackgroundAI:batchExport', batchExportStart, {
        requestCount: requests.length,
      });
      const durationMs = Date.now() - startedAtMs;
      console.log(
        `[BackgroundAI] Batch mode enabled. Exported ${requests.length} pending LLM request(s) (one per employer, sorted by employer role count) to ${getLlmBatchRequestsFilePath()} in ${durationMs}ms.`,
      );
      logBackgroundTaskEnd('BackgroundAI:worker', workerTimingStart, {
        mode: 'batch',
        requestCount: requests.length,
      });
    })().catch((error) => {
      console.error('[BackgroundAI] Failed to export pending batch LLM requests:', error);
      logBackgroundTaskEnd('BackgroundAI:worker', workerTimingStart, {
        mode: 'batch',
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return;
  }

  const softwareCandidates = representativeJobs.filter(isSoftwareTitle);
  const missingAuditCount = candidates.filter((job) => !hasAuditData(job)).length;
  const missingImpactCount = candidates.filter((job) => !hasImpactData(job)).length;
  const missingQualityOfLifeCount = candidates.filter((job) => !hasQualityOfLifeData(job)).length;
  const forcedLegacyRefreshCount = candidates.filter(needsLegacyPromptRefresh).length;

  console.log(
    `[BackgroundAI] Candidates summary: uniqueEmployers=${totalEmployers}, missingAudit=${missingAuditCount}, missingImpact=${missingImpactCount}, missingQualityOfLife=${missingQualityOfLifeCount}, forcedLegacyPromptRefresh=${forcedLegacyRefreshCount}.`,
  );
  console.log(
    `[BackgroundAI] Employer queue built: ${totalEmployers} employer bucket(s), sorted by open-role count descending. Running AI for first job in each employer bucket.`,
  );
  console.log(
    `[BackgroundAI] Heartbeat target filter: title contains "software" (${softwareCandidates.length}/${representativeJobs.length} representative jobs).`,
  );

  void (async () => {
    let processedEmployers = 0;
    let processedSoftwareEmployers = 0;
    let auditCompleted = 0;
    let impactCompleted = 0;
    let qualityOfLifeCompleted = 0;

    let auditFailed = 0;
    let impactFailed = 0;
    let qualityOfLifeFailed = 0;

    const heartbeatTimer = setInterval(() => {
      const heartbeatOp = 'heartbeat:background-ai'
      const heartbeatStart = logBackgroundTaskStart('BackgroundAI:heartbeatTick');
      setActiveOperation(heartbeatOp)
      try {
        const elapsedMs = Date.now() - startedAtMs;
        const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
        const percent =
          representativeJobs.length > 0
            ? ((processedEmployers / representativeJobs.length) * 100).toFixed(1)
            : '100.0';
        console.log(
          `[BackgroundAI] Heartbeat: processedEmployers=${processedEmployers}/${representativeJobs.length} (${percent}%), softwareRepresentativeProcessed=${processedSoftwareEmployers}/${softwareCandidates.length}, elapsed=${elapsedSeconds}s, audit ok/fail=${auditCompleted}/${auditFailed}, impact ok/fail=${impactCompleted}/${impactFailed}, qol ok/fail=${qualityOfLifeCompleted}/${qualityOfLifeFailed}.`,
        );
      } finally {
        clearActiveOperation(heartbeatOp)
        logBackgroundTaskEnd('BackgroundAI:heartbeatTick', heartbeatStart, {
          processedEmployers,
          totalEmployers,
        });
      }
    }, BACKGROUND_AI_HEARTBEAT_MS);

    try {
      await runWithConcurrency(sortedEmployerBuckets, employerQueueConcurrency, async (bucket, index) => {
        const employerTaskStart = logBackgroundTaskStart('BackgroundAI:employerTask', {
          index: index + 1,
          totalEmployers,
        });
        const job = bucket.jobs[0];
        const employerName = bucket.employerName;
        const employerJobCount = bucket.jobs.length;
        const jobTitle = String(job.name ?? '').trim() || 'Unknown Job';
        const shouldForceLegacyRefresh = needsLegacyPromptRefresh(job);
        const preHasAudit = hasAuditData(job);
        const preHasImpact = hasImpactData(job);
        const preHasQuality = hasQualityOfLifeData(job);
        const promptVersions = summarizePromptVersions(job);
        console.log(
          `[BackgroundAI] Employer start ${index + 1}/${sortedEmployerBuckets.length}: ${employerName} | representative job: ${jobTitle} (roles=${employerJobCount}, forcedLegacyPromptRefresh=${shouldForceLegacyRefresh})`,
        );
        console.log(
          `[BackgroundAI] Employer precheck ${index + 1}/${sortedEmployerBuckets.length}: ${employerName} | hasAudit=${preHasAudit}, hasImpact=${preHasImpact}, hasQualityOfLife=${preHasQuality}, promptVersions=${promptVersions}`,
        );

        const unifiedResult = await runUnifiedCompanyAiAsync(job, true, shouldForceLegacyRefresh);
        const currentScores = getCurrentCompanyAiScores(job);

        if (!unifiedResult.error && currentScores.auditScore > 0) {
          auditCompleted += 1;
        } else {
          auditFailed += 1;
        }

        if (!unifiedResult.error && currentScores.impactScore > 0) {
          impactCompleted += 1;
        } else {
          impactFailed += 1;
        }

        if (!unifiedResult.error && currentScores.qualityOfLifeScore > 0) {
          qualityOfLifeCompleted += 1;
        } else {
          qualityOfLifeFailed += 1;
        }

        processedEmployers += 1;
        if (isSoftwareTitle(job)) {
          processedSoftwareEmployers += 1;
        }

        const employersLeft = Math.max(0, totalEmployers - processedEmployers);

        const auditState = !unifiedResult.error && currentScores.auditScore > 0
          ? 'ok'
          : `failed: ${unifiedResult.error ?? 'no audit data returned'}`;
        const impactState = !unifiedResult.error && currentScores.impactScore > 0
          ? 'ok'
          : `failed: ${unifiedResult.error ?? 'no impact data returned'}`;
        const qualityState = !unifiedResult.error && currentScores.qualityOfLifeScore > 0
          ? 'ok'
          : `failed: ${unifiedResult.error ?? 'no quality-of-life data returned'}`;
        if (impactState.startsWith('failed:') || qualityState.startsWith('failed:') || auditState.startsWith('failed:')) {
          console.error(
            `[BackgroundAI] Employer failure details ${processedEmployers}/${totalEmployers}: ${employerName} | source=${String(job.source ?? '').trim()} | url=${String(job.source_url ?? '').trim()} | title=${jobTitle}`,
          );
        }
        console.log(
          `[BackgroundAI] Employer done ${processedEmployers}/${totalEmployers}: ${employerName} (roles=${employerJobCount}, employersLeft=${employersLeft}) | ${jobTitle} (audit=${auditState}, impact=${impactState}, qol=${qualityState})`,
        );

        if ((index + 1) % 100 === 0) {
          console.log(
            `[BackgroundAI] Progress ${index + 1}/${totalEmployers} employers (audit ok=${auditCompleted}, impact ok=${impactCompleted}, qol ok=${qualityOfLifeCompleted})`,
          );
        }
        logBackgroundTaskEnd('BackgroundAI:employerTask', employerTaskStart, {
          employerName,
          employerJobCount,
          auditFailed,
          impactFailed,
          qualityOfLifeFailed,
        });
      });

      clearInterval(heartbeatTimer);

      const durationMs = Date.now() - startedAtMs;
      console.log(
        `[BackgroundAI] Complete in ${durationMs}ms. ` +
          `audit ok=${auditCompleted}, failed=${auditFailed}; ` +
          `impact ok=${impactCompleted}, failed=${impactFailed}; ` +
          `qualityOfLife ok=${qualityOfLifeCompleted}, failed=${qualityOfLifeFailed}.`,
      );
      logBackgroundTaskEnd('BackgroundAI:worker', workerTimingStart, {
        mode: 'inline',
        processedEmployers,
        totalEmployers,
      });
    } catch (error) {
      clearInterval(heartbeatTimer);
      const durationMs = Date.now() - startedAtMs;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[BackgroundAI] Worker failed after ${durationMs}ms: ${message}`);
      logBackgroundTaskEnd('BackgroundAI:worker', workerTimingStart, {
        mode: 'inline',
        error: message,
      });
    }
  })();
}
