import type { ScrapedJob } from '../scraping/ScrapedJob.js';
import { auditJobAsync } from '../searching/SearchAudit.js';
import { impactJobAIAsync } from '../searching/SearchImpactAI.js';
import { qualityOfLifeJobAsync } from '../searching/SearchQualityOfLife.js';

const BACKGROUND_AI_CONCURRENCY = Math.max(
  1,
  Number(process.env.BACKGROUND_AI_CONCURRENCY ?? 2),
);
const BACKGROUND_AI_HEARTBEAT_MS = Math.max(
  5_000,
  Number(process.env.BACKGROUND_AI_HEARTBEAT_MS ?? 30_000),
);

function hasAuditData(job: ScrapedJob): boolean {
  const employer = job.scrapedEmployer;
  if (!employer) {
    return false;
  }

  return (
    employer.ai_score > 0 ||
    employer.ai_red_flag_score > 0 ||
    String(employer.ai_summary ?? '').trim().length > 0 ||
    String(employer.ai_red_flag_summary ?? '').trim().length > 0
  );
}

function hasImpactData(job: ScrapedJob): boolean {
  const employer = job.scrapedEmployer;
  if (!employer) {
    return false;
  }

  return (
    employer.ai_impact_score > 0 ||
    String(employer.ai_impact_summary ?? '').trim().length > 0
  );
}

function hasQualityOfLifeData(job: ScrapedJob): boolean {
  const employer = job.scrapedEmployer;
  if (!employer) {
    return false;
  }

  return (
    employer.employeeQualityOfLifeScore > 0 ||
    String(employer.employeeQualityOfLifeSummary ?? '').trim().length > 0
  );
}

function needsAiEnrichment(job: ScrapedJob): boolean {
  return !hasAuditData(job) || !hasImpactData(job) || !hasQualityOfLifeData(job);
}

function isSoftwareTitle(job: ScrapedJob): boolean {
  const title = String(job.name ?? '').trim().toLowerCase();
  return title.includes('software');
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

  const candidates = jobs.filter(needsAiEnrichment);
  if (candidates.length === 0) {
    console.log('[BackgroundAI] Skipping: all jobs already have audit/impact/quality-of-life data.');
    return;
  }

  console.log(
    `[BackgroundAI] Triggered for ${jobs.length} jobs. Enrichment needed for ${candidates.length} jobs. Concurrency=${BACKGROUND_AI_CONCURRENCY}.`,
  );

  const uniqueEmployers = new Set(
    candidates.map((job) => String(job.company_name ?? '').trim().toLowerCase()).filter(Boolean),
  );
  const softwareCandidates = candidates.filter(isSoftwareTitle);
  const missingAuditCount = candidates.filter((job) => !hasAuditData(job)).length;
  const missingImpactCount = candidates.filter((job) => !hasImpactData(job)).length;
  const missingQualityOfLifeCount = candidates.filter((job) => !hasQualityOfLifeData(job)).length;

  console.log(
    `[BackgroundAI] Candidates summary: uniqueEmployers=${uniqueEmployers.size}, missingAudit=${missingAuditCount}, missingImpact=${missingImpactCount}, missingQualityOfLife=${missingQualityOfLifeCount}.`,
  );
  console.log(
    `[BackgroundAI] Heartbeat target filter: title contains "software" (${softwareCandidates.length}/${candidates.length} candidates).`,
  );

  void (async () => {
    let processedJobs = 0;
    let processedSoftwareJobs = 0;
    let auditCompleted = 0;
    let impactCompleted = 0;
    let qualityOfLifeCompleted = 0;

    let auditFailed = 0;
    let impactFailed = 0;
    let qualityOfLifeFailed = 0;

    const heartbeatTimer = setInterval(() => {
      const elapsedMs = Date.now() - startedAtMs;
      const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
      const percent =
        softwareCandidates.length > 0
          ? ((processedSoftwareJobs / softwareCandidates.length) * 100).toFixed(1)
          : '100.0';
      console.log(
        `[BackgroundAI] Heartbeat (software titles only): processed=${processedSoftwareJobs}/${softwareCandidates.length} (${percent}%), elapsed=${elapsedSeconds}s, overallProcessed=${processedJobs}/${candidates.length}, audit ok/fail=${auditCompleted}/${auditFailed}, impact ok/fail=${impactCompleted}/${impactFailed}, qol ok/fail=${qualityOfLifeCompleted}/${qualityOfLifeFailed}.`,
      );
    }, BACKGROUND_AI_HEARTBEAT_MS);

    try {
      await runWithConcurrency(candidates, BACKGROUND_AI_CONCURRENCY, async (job, index) => {
        const employerName = String(job.company_name ?? '').trim() || 'Unknown Employer';
        const jobTitle = String(job.name ?? '').trim() || 'Unknown Job';
        console.log(
          `[BackgroundAI] Job start ${index + 1}/${candidates.length}: ${employerName} | ${jobTitle}`,
        );

        const [auditResult, impactResult, qualityResult] = await Promise.allSettled([
          auditJobAsync(job, false),
          impactJobAIAsync(job, false),
          qualityOfLifeJobAsync(job, false),
        ]);

        if (auditResult.status === 'fulfilled') {
          auditCompleted += 1;
        } else {
          auditFailed += 1;
        }

        if (impactResult.status === 'fulfilled') {
          impactCompleted += 1;
        } else {
          impactFailed += 1;
        }

        if (qualityResult.status === 'fulfilled') {
          qualityOfLifeCompleted += 1;
        } else {
          qualityOfLifeFailed += 1;
        }

        processedJobs += 1;
        if (isSoftwareTitle(job)) {
          processedSoftwareJobs += 1;
        }

        const auditState = auditResult.status === 'fulfilled' ? 'ok' : 'failed';
        const impactState = impactResult.status === 'fulfilled' ? 'ok' : 'failed';
        const qualityState = qualityResult.status === 'fulfilled' ? 'ok' : 'failed';
        console.log(
          `[BackgroundAI] Job done ${processedJobs}/${candidates.length}: ${employerName} | ${jobTitle} (audit=${auditState}, impact=${impactState}, qol=${qualityState})`,
        );

        if ((index + 1) % 100 === 0) {
          console.log(
            `[BackgroundAI] Progress ${index + 1}/${candidates.length} (audit ok=${auditCompleted}, impact ok=${impactCompleted}, qol ok=${qualityOfLifeCompleted})`,
          );
        }
      });

      clearInterval(heartbeatTimer);

      const durationMs = Date.now() - startedAtMs;
      console.log(
        `[BackgroundAI] Complete in ${durationMs}ms. ` +
          `audit ok=${auditCompleted}, failed=${auditFailed}; ` +
          `impact ok=${impactCompleted}, failed=${impactFailed}; ` +
          `qualityOfLife ok=${qualityOfLifeCompleted}, failed=${qualityOfLifeFailed}.`,
      );
    } catch (error) {
      clearInterval(heartbeatTimer);
      const durationMs = Date.now() - startedAtMs;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[BackgroundAI] Worker failed after ${durationMs}ms: ${message}`);
    }
  })();
}
