import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';
import { warmJobHaystachCache, getVocabSize } from '../../searching/SearchUtils.js';
import { warmJobResumeTargetStats } from '../../searching/SearchResumeMatch.js';
import { clearActiveOperation, setActiveOperation } from '../ServerActivityTracker.js';

const LOG_HAYSTACK_FINE = false;

export function warmHaystackAsync(jobs: ScrapedJob[]): void {
  const warmupTotal = jobs.length;

  const PRE_SCAN_FIELD_WARN = 5_000;
  const topLargeJobs: Array<{ idx: number; descLen: number; label: string }> = [];
  for (let idx = 0; idx < jobs.length; idx++) {
    const job = jobs[idx];
    const descLen = String(job.description ?? '').length;
    if (descLen > PRE_SCAN_FIELD_WARN) {
      topLargeJobs.push({ idx, descLen, label: `${String(job.company_name ?? '?')} | ${String(job.name ?? '?')}` });
    }
  }
  topLargeJobs.sort((a, b) => b.descLen - a.descLen);
  const topN = topLargeJobs.slice(0, 20);
  console.log(`[Haystack] Pre-scan: ${topLargeJobs.length} jobs with description > ${PRE_SCAN_FIELD_WARN} chars`);
  if (topN.length > 0) {
    console.log(`[Haystack] Top ${topN.length} largest descriptions:`);
    for (const { idx, descLen, label } of topN) {
      console.log(`  job[${idx}] ${descLen.toLocaleString()} chars — ${label}`);
    }
  }

  (async () => {
    const CHUNK = 25;
    const SLOW_CHUNK_MS = 50;
    const SLOW_JOB_MS = 5;
    const FIELD_WARN_LEN = 2_000;
    let i = 0;
    const t0 = performance.now();
    while (i < jobs.length) {
      const chunkLabel = `haystack-warmup chunk ${Math.floor(i / CHUNK)} (jobs ${i}–${Math.min(i + CHUNK - 1, warmupTotal - 1)})`;
      setActiveOperation(chunkLabel);
      const chunkStart = performance.now();
      const chunk = jobs.slice(i, i + CHUNK);

      for (const job of chunk) {
        const jobStart = performance.now();
        const descRaw = String(job.description ?? '');
        const nameRaw = String(job.name ?? '');
        const tagsRaw = (job.tags ?? []).join(' ');

        warmJobHaystachCache([job]);
        warmJobResumeTargetStats(job);
        const jobMs = performance.now() - jobStart;

        if (LOG_HAYSTACK_FINE) {
          if (jobMs > SLOW_JOB_MS) {
            const fields = [
              `desc=${descRaw.length}`,
              `name=${nameRaw.length}`,
              `tags=${tagsRaw.length}`,
              `url=${String(job.source_url ?? '').length}`,
            ].join(' ');
            const cappedAt = descRaw.length > 800 ? ' [DESC_CAPPED]' : '';
            console.warn(
              `[Haystack] Slow job ${jobMs.toFixed(1)}ms — ` +
              `${String(job.company_name ?? '?')} | ${nameRaw.slice(0, 60)}${cappedAt}\n` +
              `  fields: ${fields}  source: ${String(job.source ?? '?')}`,
            );
          } else if (descRaw.length > FIELD_WARN_LEN) {
            console.log(
              `[Haystack] Large desc (${descRaw.length} chars) but fast (${jobMs.toFixed(1)}ms) — ` +
              `${String(job.company_name ?? '?')} | ${nameRaw.slice(0, 60)}  [cap working]`,
            );
          }
        }
      }

      const chunkMs = performance.now() - chunkStart;
      clearActiveOperation(chunkLabel);
      i += CHUNK;
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      const pct = Math.min(100, Math.round((i / warmupTotal) * 100));
      const level = chunkMs > SLOW_CHUNK_MS ? 'warn' : 'log';
      console[level](`[Haystack] Warmup ${pct}% — ${Math.min(i, warmupTotal).toLocaleString()}/${warmupTotal.toLocaleString()} jobs — chunk ${chunkMs.toFixed(0)}ms for ${chunk.length} jobs (avg ${(chunkMs / chunk.length).toFixed(1)}ms/job) — ${elapsed}s elapsed`);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    console.log(`[Timer] 🟢 Haystack warmup → ${(performance.now() - t0).toFixed(0)}ms total | vocab: ${getVocabSize().toLocaleString()} unique tokens`);
  })().catch((err) => console.warn('[Startup] Haystack warmup failed:', err));
}
