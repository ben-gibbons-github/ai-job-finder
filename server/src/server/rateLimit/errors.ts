import type { Socket } from 'socket.io'

import type { RateLimitEventName } from './types.js'

export function emitRateLimitError(socket: Socket, eventName: RateLimitEventName): void {
  socket.emit('error:rate_limited', {
    event: eventName,
    error: 'Rate limit exceeded. Please retry shortly.',
  })
}

export function callbackRateLimitError<T extends { error?: string }>(
  callback: ((response: T) => void) | undefined,
  response: T,
): void {
  callback?.(response)
}
