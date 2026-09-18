import { promises as fs } from 'node:fs';
import {
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  brotliDecompressSync,
} from 'node:zlib';
import {
  recordCacheRead,
  registerCachePath,
} from './CacheIoTelemetry.js';
import { isSqlOnlyCacheLoadingEnabled } from './SqlOnlyCacheLoading.js';

const COMPRESSED_PREFIX = 'CBR1:';

export type CacheParseFn<T> = (raw: string, sourcePath: string) => T | Promise<T>;

export class CacheHandler {
  private readonly cachePath: string;

  constructor(cachePath: string) {
    this.cachePath = cachePath;
    registerCachePath(this.cachePath, 'json');
  }

  public async loadWithFallback<T>(parse: CacheParseFn<T>): Promise<T> {
    if (isSqlOnlyCacheLoadingEnabled()) {
      recordCacheRead(this.cachePath, false);
      throw new Error('JSON cache reads are disabled by SQL_ONLY_CACHE_LOADING');
    }

    const candidates = [this.cachePath];
    const failures: string[] = [];

    for (const candidatePath of candidates) {
      let raw: string;

      try {
        raw = await fs.readFile(candidatePath, 'utf8');
      } catch (error) {
        failures.push(`${candidatePath}: read failed (${this.errorToMessage(error)})`);
        continue;
      }

      try {
        const decodedRaw = this.decodeFromStorage(raw);
        const parsed = await parse(decodedRaw, candidatePath);
        recordCacheRead(this.cachePath, true);
        return parsed;
      } catch (error) {
        failures.push(`${candidatePath}: parse failed (${this.errorToMessage(error)})`);
        continue;
      }
    }

    recordCacheRead(this.cachePath, false);

    throw new Error(`All cache files failed to load. ${failures.join(' | ')}`);
  }

  public loadWithFallbackSync<T>(parse: (raw: string, sourcePath: string) => T): T {
    if (isSqlOnlyCacheLoadingEnabled()) {
      recordCacheRead(this.cachePath, false);
      throw new Error('JSON cache reads are disabled by SQL_ONLY_CACHE_LOADING');
    }

    const candidates = [this.cachePath];
    const failures: string[] = [];

    for (const candidatePath of candidates) {
      let raw: string;

      try {
        raw = readFileSync(candidatePath, 'utf8');
      } catch (error) {
        failures.push(`${candidatePath}: read failed (${this.errorToMessage(error)})`);
        continue;
      }

      try {
        const decodedRaw = this.decodeFromStorage(raw);
        const parsed = parse(decodedRaw, candidatePath);
        recordCacheRead(this.cachePath, true);
        return parsed;
      } catch (error) {
        failures.push(`${candidatePath}: parse failed (${this.errorToMessage(error)})`);
        continue;
      }
    }

    recordCacheRead(this.cachePath, false);

    throw new Error(`All cache files failed to load. ${failures.join(' | ')}`);
  }

  public async save(raw: string): Promise<void> {
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    await fs.writeFile(this.cachePath, raw, 'utf8');
    recordCacheRead(this.cachePath, true);
  }

  public saveSync(raw: string): void {
    fs.mkdir(path.dirname(this.cachePath), { recursive: true }).then(() => {
      return fs.writeFile(this.cachePath, raw, 'utf8');
    }).catch((error) => {
      throw error;
    });
  }

  private decodeFromStorage(storedRaw: string): string {
    if (!storedRaw.startsWith(COMPRESSED_PREFIX)) {
      // Legacy files were stored as plain JSON text.
      return storedRaw;
    }

    const payload = storedRaw.slice(COMPRESSED_PREFIX.length);
    const compressedBuffer = Buffer.from(payload, 'base64');
    return brotliDecompressSync(compressedBuffer).toString('utf8');
  }

  private errorToMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
