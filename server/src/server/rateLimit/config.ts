import type { LeakyBucketConfig, RateLimitEventName } from './types.js'

export const SOCKET_RATE_LIMITS: Record<RateLimitEventName, LeakyBucketConfig> = {
  'client:hello': {
    capacity: Number(process.env.SOCKET_RATE_LIMIT_HELLO_CAPACITY ?? 10),
    leakPerSecond: Number(process.env.SOCKET_RATE_LIMIT_HELLO_LEAK_PER_SECOND ?? 2),
  },
  search: {
    capacity: Number(process.env.SOCKET_RATE_LIMIT_SEARCH_CAPACITY ?? 20),
    leakPerSecond: Number(process.env.SOCKET_RATE_LIMIT_SEARCH_LEAK_PER_SECOND ?? 1.5),
  },
  'search:auditAll': {
    capacity: Number(process.env.SOCKET_RATE_LIMIT_AUDIT_ALL_CAPACITY ?? 2),
    leakPerSecond: Number(process.env.SOCKET_RATE_LIMIT_AUDIT_ALL_LEAK_PER_SECOND ?? 0.03),
  },
  'search:suggestions': {
    capacity: Number(process.env.SOCKET_RATE_LIMIT_SUGGESTIONS_CAPACITY ?? 30),
    leakPerSecond: Number(process.env.SOCKET_RATE_LIMIT_SUGGESTIONS_LEAK_PER_SECOND ?? 4),
  },
  'locations:search': {
    capacity: Number(process.env.SOCKET_RATE_LIMIT_LOCATION_CAPACITY ?? 25),
    leakPerSecond: Number(process.env.SOCKET_RATE_LIMIT_LOCATION_LEAK_PER_SECOND ?? 3),
  },
  'job:audit': {
    capacity: Number(process.env.SOCKET_RATE_LIMIT_JOB_AUDIT_CAPACITY ?? 8),
    leakPerSecond: Number(process.env.SOCKET_RATE_LIMIT_JOB_AUDIT_LEAK_PER_SECOND ?? 0.4),
  },
}

export function clampConfig(config: LeakyBucketConfig): LeakyBucketConfig {
  return {
    capacity: Number.isFinite(config.capacity) && config.capacity > 0 ? config.capacity : 1,
    leakPerSecond: Number.isFinite(config.leakPerSecond) && config.leakPerSecond > 0 ? config.leakPerSecond : 0.1,
  }
}
