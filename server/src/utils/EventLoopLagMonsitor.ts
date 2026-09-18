import {
  getActiveOperation,
  getLastCompletedAt,
  getLastCompletedOp,
} from '../server/ServerActivityTracker.js'

export const DEFAULT_EVENT_LOOP_LAG_INTERVAL_MS = 100
export const DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS = 150

export function startEventLoopLagMonitor(
  intervalMs = DEFAULT_EVENT_LOOP_LAG_INTERVAL_MS,
  warnThresholdMs = DEFAULT_EVENT_LOOP_LAG_WARN_THRESHOLD_MS,
): NodeJS.Timeout {
  let lastTick = Date.now()

  const monitor = setInterval(() => {
    const now = Date.now()
    const lag = now - lastTick - intervalMs

    if (lag > warnThresholdMs) {
      const active = getActiveOperation()
      let blame: string

      if (active !== 'idle') {
        blame = `active: "${active}"`
      } else {
        const msSinceEnd = now - getLastCompletedAt()
        blame = `recently finished: "${getLastCompletedOp()}" (ended ~${msSinceEnd}ms ago)`
      }

      console.warn(`[EventLoop] ⚠️  Blocked for ~${lag + intervalMs}ms — ${blame}`)
    }

    lastTick = now
  }, intervalMs)

  monitor.unref?.()
  return monitor
}
