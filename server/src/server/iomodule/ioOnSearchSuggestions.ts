import type { Socket } from 'socket.io';

import { getSearchSuggestions } from '../../searching/searchSuggestions/SearchSuggestion.js';
import {
  callbackRateLimitError,
  consumeLeakyBucket,
  emitRateLimitError,
} from '../rateLimit/RateLimit.js';

interface RegisterSearchSuggestionsSocketOnOptions {
  socket: Socket;
}

export function registerSearchSuggestionsSocketOn(options: RegisterSearchSuggestionsSocketOnOptions): void {
  const { socket } = options;

  socket.on(
    'search:suggestions',
    (
      payload: { query?: string; limit?: number },
      callback?: (response: { suggestions: string[]; error?: string }) => void,
    ) => {
      if (!consumeLeakyBucket(socket.id, 'search:suggestions')) {
        emitRateLimitError(socket, 'search:suggestions');
        callbackRateLimitError(callback, {
          suggestions: [],
          error: 'Rate limit exceeded for search suggestions',
        });
        return;
      }

      const query = String(payload?.query ?? '').trim();
      const limit = Math.max(1, Math.min(15, Number(payload?.limit ?? 8)));

      if (query.length < 2) {
        callback?.({ suggestions: [] });
        return;
      }

      try {
        const suggestions = getSearchSuggestions(query, limit);
        callback?.({ suggestions });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Search suggestion failed for "${query}": ${message}`);
        callback?.({ suggestions: [], error: 'Failed to load suggestions' });
      }
    },
  );
}
