const BACKGROUND_TASK_TIMING_LOG_ENABLED =
  String(process.env.BACKGROUND_TASK_TIMING_LOG ?? '').toLowerCase() === 'true';

export function isBackgroundTaskTimingEnabled(): boolean {
  return BACKGROUND_TASK_TIMING_LOG_ENABLED;
}

export function logBackgroundTaskStart(task: string, details?: Record<string, unknown>): number {
  const startedAt = performance.now();
  if (BACKGROUND_TASK_TIMING_LOG_ENABLED) {
    console.log(
      `[BackgroundTask][start] ${task}${details ? ` ${JSON.stringify(details)}` : ''}`,
    );
  }
  return startedAt;
}

export function logBackgroundTaskEnd(
  task: string,
  startedAt: number,
  details?: Record<string, unknown>,
): number {
  const ms = Number((performance.now() - startedAt).toFixed(2));
  if (BACKGROUND_TASK_TIMING_LOG_ENABLED) {
    console.log(
      `[BackgroundTask][end] ${task} ms=${ms}${details ? ` ${JSON.stringify(details)}` : ''}`,
    );
  }
  return ms;
}
