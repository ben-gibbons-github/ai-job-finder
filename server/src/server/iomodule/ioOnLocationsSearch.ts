import type { Socket } from 'socket.io';

import { searchLocationsOpenStreetMap, type LocationOption } from '../../searching/locationSearch/LocationSearch.js';
import {
  callbackRateLimitError,
  consumeLeakyBucket,
  emitRateLimitError,
} from '../rateLimit/RateLimit.js';

interface RegisterLocationsSearchSocketOnOptions {
  socket: Socket;
}

export function registerLocationsSearchSocketOn(options: RegisterLocationsSearchSocketOnOptions): void {
  const { socket } = options;

  socket.on(
    'locations:search',
    async (
      payload: { query?: string },
      callback?: (response: { options: LocationOption[]; error?: string }) => void,
    ) => {
      if (!consumeLeakyBucket(socket.id, 'locations:search')) {
        emitRateLimitError(socket, 'locations:search');
        callbackRateLimitError(callback, {
          options: [],
          error: 'Rate limit exceeded for location search',
        });
        return;
      }

      const query = (payload?.query || '').trim();

      if (query.length < 2) {
        callback?.({ options: [] });
        return;
      }

      try {
        const options = await searchLocationsOpenStreetMap(query);
        callback?.({ options });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Location search failed for "${query}": ${message}`);
        callback?.({ options: [], error: 'Failed to search locations' });
      }
    },
  );
}
