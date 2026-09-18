/** Yield to the event loop between large sync operations. */
const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve))

/**
 * Non-blocking filter: processes arr in chunks, yielding between each so
 * the event loop stays responsive.
 */
export async function asyncFilter<T>(arr: T[], predicate: (item: T) => boolean, chunkSize = 50_000): Promise<T[]> {
  const result: T[] = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, arr.length)
    for (let j = i; j < end; j++) {
      if (predicate(arr[j])) result.push(arr[j])
    }
    if (end < arr.length) await yieldToEventLoop()
  }
  return result
}

/**
 * Like asyncFilter but stops once limit items have been collected.
 */
export async function asyncFilterFirstN<T>(
  arr: T[],
  predicate: (item: T) => boolean,
  limit: number,
  chunkSize = 500,
): Promise<T[]> {
  const result: T[] = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, arr.length)
    for (let j = i; j < end; j++) {
      if (predicate(arr[j])) {
        result.push(arr[j])
        if (result.length >= limit) return result
      }
    }
    if (end < arr.length && result.length < limit) await yieldToEventLoop()
  }
  return result
}
