export type RateLimitEventName =
  | 'client:hello'
  | 'search'
  | 'search:auditAll'
  | 'search:suggestions'
  | 'locations:search'
  | 'job:audit'

export interface LeakyBucketConfig {
  capacity: number
  leakPerSecond: number
}

export interface LeakyBucketState {
  level: number
  lastUpdatedAtMs: number
}
