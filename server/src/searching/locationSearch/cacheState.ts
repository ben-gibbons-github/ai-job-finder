import type { LocationOption } from './types.js'

export type LocationSearchCacheStore = Record<string, LocationOption[]>

export const locationSearchCache = new Map<string, LocationOption[]>()
export let loadPromise: Promise<void> | null = null

export function setLoadPromise(next: Promise<void> | null): void {
  loadPromise = next
}
