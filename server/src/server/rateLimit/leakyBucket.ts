import { getSocketBuckets } from './bucketStore.js'
import { clampConfig, SOCKET_RATE_LIMITS } from './config.js'
import type { RateLimitEventName } from './types.js'

export function consumeLeakyBucket(socketId: string, eventName: RateLimitEventName): boolean {
  const nowMs = Date.now()
  const config = clampConfig(SOCKET_RATE_LIMITS[eventName])
  const socketBuckets = getSocketBuckets(socketId)
  const current = socketBuckets.get(eventName) ?? { level: 0, lastUpdatedAtMs: nowMs }
  const elapsedSeconds = Math.max(0, (nowMs - current.lastUpdatedAtMs) / 1000)
  const leakedLevel = Math.max(0, current.level - elapsedSeconds * config.leakPerSecond)

  if (leakedLevel + 1 > config.capacity) {
    socketBuckets.set(eventName, { level: leakedLevel, lastUpdatedAtMs: nowMs })
    return false
  }

  socketBuckets.set(eventName, { level: leakedLevel + 1, lastUpdatedAtMs: nowMs })
  return true
}
