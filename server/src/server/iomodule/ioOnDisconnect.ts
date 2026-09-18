import type { Socket } from 'socket.io';

import { clearSocketRateLimitState } from '../rateLimit/RateLimit.js';

interface RegisterDisconnectSocketOnOptions {
  socket: Socket;
}

export function registerDisconnectSocketOn(options: RegisterDisconnectSocketOnOptions): void {
  const { socket } = options;

  socket.on('disconnect', () => {
    clearSocketRateLimitState(socket.id);
    console.log(`Socket disconnected: ${socket.id}`);
  });
}
