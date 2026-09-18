import type { LeakyBucketState, RateLimitEventName } from './types.js'

const socketBucketStore = new Map<string, Map<RateLimitEventName, LeakyBucketState>>()

export function getSocketBuckets(socketId: string): Map<RateLimitEventName, LeakyBucketState> {
  const existing = socketBucketStore.get(socketId)
  if (existing) {
    return existing
  }

  const created = new Map<RateLimitEventName, LeakyBucketState>()
  socketBucketStore.set(socketId, created)
  return created
}

export function clearSocketRateLimitState(socketId: string): void {
  socketBucketStore.delete(socketId)
}

export function sweepIdleBuckets(keyPrefix: string, idleMs: number): number {
  const nowMs = Date.now()
  let deleted = 0

  for (const [key, buckets] of socketBucketStore) {
    if (!key.startsWith(keyPrefix)) {
      continue
    }

    const newestUpdateMs = Math.max(...Array.from(buckets.values(), (bucket) => bucket.lastUpdatedAtMs))
    if (nowMs - newestUpdateMs > idleMs) {
      socketBucketStore.delete(key)
      deleted += 1
    }
  }

  return deleted
}
