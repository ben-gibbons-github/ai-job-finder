import type { Socket } from 'socket.io';

import { callbackRateLimitError, consumeLeakyBucket, emitRateLimitError } from './rateLimit/RateLimit.js';
import { selectCompanyJobs, selectSeedJob } from './rerollai/jobSelection.js';
import { runRerollForCompany } from './rerollai/runReroll.js';
import type { RegisterRerollAiDebugOptions, RerollCallback, RerollPayload } from './rerollai/types.js';

export function registerRerollAiDebugHandler(
  socket: Socket,
  options: RegisterRerollAiDebugOptions,
): void {
  const { searchDebugEnabled, getJobs } = options;

  socket.on(
    'job:reroll-ai',
    (
      payload: RerollPayload,
      callback?: RerollCallback,
    ) => {
      if (!searchDebugEnabled) {
        callbackRateLimitError(callback, {
          auditScore: 0,
          auditText: '',
          error: 'Debug AI re-roll is disabled on this server',
        });
        return;
      }

      if (!consumeLeakyBucket(socket.id, 'job:audit')) {
        emitRateLimitError(socket, 'job:audit');
        callbackRateLimitError(callback, {
          auditScore: 0,
          auditText: '',
          error: 'Rate limit exceeded for debug AI re-roll',
        });
        return;
      }

      const jobs = getJobs();
      const seedJob = selectSeedJob(jobs, payload);

      if (!seedJob) {
        callback?.({ auditScore: 0, auditText: '', error: 'Job not found' });
        return;
      }

      const { companyJobs, representativeJob } = selectCompanyJobs(jobs, seedJob);

      void (async () => {
        try {
          await runRerollForCompany(socket, seedJob, companyJobs, representativeJob, callback);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          callback?.({
            auditScore: 0,
            auditText: '',
            error: `Debug AI re-roll failed: ${message}`,
          });
          console.error(`[SearchDebug] AI re-roll failed for ${String(seedJob.company_name ?? '?')}: ${message}`);
        }
      })();
    },
  );
}
