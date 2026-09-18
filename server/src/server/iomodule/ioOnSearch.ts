import type { Socket } from 'socket.io';

import SearchMain, { type SearchPayload, type RankedJobWrapper, type SearchResultMeta } from '../../searching/searchMain/SearchMain.js';
import type { ScrapedJob } from '../../scraping/core/ScrapedJob.js';
import {
  callbackRateLimitError,
  consumeLeakyBucket,
  emitRateLimitError,
} from '../rateLimit/RateLimit.js';
import { clearActiveOperation, setActiveOperation } from '../ServerActivityTracker.js';

interface RegisterSearchSocketOnOptions {
  socket: Socket;
  searchMain: SearchMain;
  getJobs: () => ScrapedJob[];
  searchDebugEnabled: boolean;
  isProduction: boolean;
}

export function registerSearchSocketOn(options: RegisterSearchSocketOnOptions): void {
  const {
    socket,
    searchMain,
    getJobs,
    searchDebugEnabled,
    isProduction,
  } = options;

  socket.on(
    'search',
    async (
      payload: SearchPayload,
      callback?: (response: { results: RankedJobWrapper[]; total: number; meta?: SearchResultMeta; error?: string }) => void,
    ) => {
      if (!consumeLeakyBucket(socket.id, 'search')) {
        emitRateLimitError(socket, 'search');
        callbackRateLimitError(callback, {
          results: [],
          total: 0,
          meta: undefined,
          error: 'Rate limit exceeded for search',
        });
        return;
      }

      try {
        const searchLabel = `search query="${String(payload?.query ?? '').slice(0, 40)}"`;
        setActiveOperation(searchLabel);
        const results = await searchMain.search(getJobs(), payload, searchDebugEnabled);
        clearActiveOperation(searchLabel);
        const response = {
          results: results.matched,
          total: results.size,
          meta: results.meta,
        };

        if (!isProduction) {
          console.log('payload?.command', payload?.command);
        }

        callback?.(response);
        if (isProduction) {
          console.log(`Search completed. results found: ${results.size}`);
        }
        socket.emit('search:results', response);
        await new Promise<void>((resolve) => setImmediate(resolve));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Search failed: ${message}`);
        const errorResponse = {
          results: [],
          total: 0,
          meta: undefined,
          error: 'Search failed',
        };
        callback?.(errorResponse);
        socket.emit('search:results', errorResponse);
      }
    },
  );
}
