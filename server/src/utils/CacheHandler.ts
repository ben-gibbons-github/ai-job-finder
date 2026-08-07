import { promises as fs } from 'node:fs';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
} from 'node:zlib';

const ENABLE_BACKUPS = false;
const ENABLE_CACHE_COMPRESSION = true;
const COMPRESSED_PREFIX = 'CBR1:';

export type CacheParseFn<T> = (raw: string, sourcePath: string) => T | Promise<T>;

export interface CacheHandlerOptions {
  backupEveryNSaves?: number;
  backup1Path?: string;
  backup2Path?: string;
}

export class CacheHandler {
  private readonly cachePath: string;
  private readonly backup1Path: string;
  private readonly backup2Path: string;
  private readonly enableBackups: boolean;
  private readonly enableCompression: boolean;
  private readonly backupEveryNSaves: number;

  private saveCount = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(cachePath: string, options: CacheHandlerOptions = {}) {
    this.cachePath = cachePath;
    this.backup1Path = options.backup1Path ?? `${cachePath}.backup1`;
    this.backup2Path = options.backup2Path ?? `${cachePath}.backup2`;
    this.enableBackups = ENABLE_BACKUPS;
    this.enableCompression = ENABLE_CACHE_COMPRESSION;
    this.backupEveryNSaves = Math.max(1, options.backupEveryNSaves ?? 10);
  }

  public getPaths(): {
    cachePath: string;
    backup1Path: string;
    backup2Path: string;
    enableBackups: boolean;
    enableCompression: boolean;
  } {
    return {
      cachePath: this.cachePath,
      backup1Path: this.backup1Path,
      backup2Path: this.backup2Path,
      enableBackups: this.enableBackups,
      enableCompression: this.enableCompression,
    };
  }

  public save(serializedData: string): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const dataToPersist = this.encodeForStorage(serializedData);

      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      await fs.writeFile(this.cachePath, dataToPersist, 'utf8');
      if (!this.enableBackups) {
        return;
      }

      await fs.writeFile(this.sizeFilePath(this.cachePath), String(Buffer.byteLength(dataToPersist, 'utf8')), 'utf8');

      this.saveCount += 1;
      if (this.saveCount % this.backupEveryNSaves === 0) {
        await this.rotateBackups();
      }
    });

    return this.writeQueue;
  }

  public saveSync(serializedData: string): void {
    const dataToPersist = this.encodeForStorage(serializedData);
    const sizeKb = Math.round(Buffer.byteLength(dataToPersist, 'utf8') / 1024);
    if (sizeKb > 200) {
      console.warn(`[CacheHandler] saveSync writing ${sizeKb} KB to ${path.basename(this.cachePath)} — this blocks the event loop!`);
    }

    mkdirSync(path.dirname(this.cachePath), { recursive: true });
    writeFileSync(this.cachePath, dataToPersist, 'utf8');
    if (!this.enableBackups) {
      return;
    }

    writeFileSync(this.sizeFilePath(this.cachePath), String(Buffer.byteLength(dataToPersist, 'utf8')), 'utf8');

    this.saveCount += 1;
    if (this.saveCount % this.backupEveryNSaves === 0) {
      this.rotateBackupsSync();
    }
  }

  public async loadWithFallback<T>(parse: CacheParseFn<T>): Promise<T> {
    const candidates = this.enableBackups
      ? [this.cachePath, this.backup1Path, this.backup2Path]
      : [this.cachePath];
    const failures: string[] = [];

    for (const candidatePath of candidates) {
      let raw: string;

      try {
        raw = await fs.readFile(candidatePath, 'utf8');
      } catch (error) {
        failures.push(`${candidatePath}: read failed (${this.errorToMessage(error)})`);
        continue;
      }

      if (this.enableBackups) {
        try {
          const validSize = await this.validateSizeIfPresent(candidatePath, raw);
          if (!validSize) {
            failures.push(`${candidatePath}: size mismatch with sidecar file`);
            continue;
          }
        } catch (error) {
          failures.push(`${candidatePath}: size verification failed (${this.errorToMessage(error)})`);
          continue;
        }
      }

      try {
        const decodedRaw = this.decodeFromStorage(raw);
        const parsed = await parse(decodedRaw, candidatePath);
        await this.compressOnReadIfNeeded(candidatePath, raw, decodedRaw);
        if (this.enableBackups) {
          await this.healLegacyArtifacts(candidatePath, raw);
        }
        return parsed;
      } catch (error) {
        failures.push(`${candidatePath}: parse failed (${this.errorToMessage(error)})`);
        continue;
      }
    }

    throw new Error(`All cache files failed to load. ${failures.join(' | ')}`);
  }

  public loadWithFallbackSync<T>(parse: (raw: string, sourcePath: string) => T): T {
    const candidates = this.enableBackups
      ? [this.cachePath, this.backup1Path, this.backup2Path]
      : [this.cachePath];
    const failures: string[] = [];

    for (const candidatePath of candidates) {
      let raw: string;

      try {
        raw = readFileSync(candidatePath, 'utf8');
      } catch (error) {
        failures.push(`${candidatePath}: read failed (${this.errorToMessage(error)})`);
        continue;
      }

      if (this.enableBackups) {
        try {
          const validSize = this.validateSizeIfPresentSync(candidatePath, raw);
          if (!validSize) {
            failures.push(`${candidatePath}: size mismatch with sidecar file`);
            continue;
          }
        } catch (error) {
          failures.push(`${candidatePath}: size verification failed (${this.errorToMessage(error)})`);
          continue;
        }
      }

      try {
        const decodedRaw = this.decodeFromStorage(raw);
        const parsed = parse(decodedRaw, candidatePath);
        this.compressOnReadIfNeededSync(candidatePath, raw, decodedRaw);
        if (this.enableBackups) {
          this.healLegacyArtifactsSync(candidatePath, raw);
        }
        return parsed;
      } catch (error) {
        failures.push(`${candidatePath}: parse failed (${this.errorToMessage(error)})`);
        continue;
      }
    }

    throw new Error(`All cache files failed to load. ${failures.join(' | ')}`);
  }

  private async rotateBackups(): Promise<void> {
    await this.copyIfExists(this.backup1Path, this.backup2Path);
    await this.copyIfExists(this.sizeFilePath(this.backup1Path), this.sizeFilePath(this.backup2Path));
    await this.copyIfExists(this.cachePath, this.backup1Path);
    await this.copyIfExists(this.sizeFilePath(this.cachePath), this.sizeFilePath(this.backup1Path));
  }

  private rotateBackupsSync(): void {
    this.copyIfExistsSync(this.backup1Path, this.backup2Path);
    this.copyIfExistsSync(this.sizeFilePath(this.backup1Path), this.sizeFilePath(this.backup2Path));
    this.copyIfExistsSync(this.cachePath, this.backup1Path);
    this.copyIfExistsSync(this.sizeFilePath(this.cachePath), this.sizeFilePath(this.backup1Path));
  }

  private async validateSizeIfPresent(filePath: string, raw: string): Promise<boolean> {
    const sizePath = this.sizeFilePath(filePath);
    let expectedSizeRaw: string;

    try {
      expectedSizeRaw = await fs.readFile(sizePath, 'utf8');
    } catch (error: unknown) {
      if (this.isMissingFileError(error)) {
        return true;
      }
      throw error;
    }

    const expectedSize = Number(expectedSizeRaw.trim());
    if (!Number.isFinite(expectedSize) || expectedSize < 0) {
      return false;
    }

    const actualSize = Buffer.byteLength(raw, 'utf8');
    return actualSize === expectedSize;
  }

  private async healLegacyArtifacts(filePath: string, raw: string): Promise<void> {
    const sizePath = this.sizeFilePath(filePath);
    const rawSize = String(Buffer.byteLength(raw, 'utf8'));

    if (!(await this.pathExists(sizePath))) {
      await fs.writeFile(sizePath, rawSize, 'utf8');
    }

    if (filePath !== this.cachePath) {
      return;
    }

    if (!(await this.pathExists(this.backup1Path))) {
      await fs.copyFile(this.cachePath, this.backup1Path);
      await fs.writeFile(this.sizeFilePath(this.backup1Path), rawSize, 'utf8');
    }

    if (!(await this.pathExists(this.backup2Path))) {
      await fs.copyFile(this.cachePath, this.backup2Path);
      await fs.writeFile(this.sizeFilePath(this.backup2Path), rawSize, 'utf8');
    }
  }

  private validateSizeIfPresentSync(filePath: string, raw: string): boolean {
    const sizePath = this.sizeFilePath(filePath);
    let expectedSizeRaw: string;

    try {
      expectedSizeRaw = readFileSync(sizePath, 'utf8');
    } catch (error: unknown) {
      if (this.isMissingFileError(error)) {
        return true;
      }
      throw error;
    }

    const expectedSize = Number(expectedSizeRaw.trim());
    if (!Number.isFinite(expectedSize) || expectedSize < 0) {
      return false;
    }

    const actualSize = Buffer.byteLength(raw, 'utf8');
    return actualSize === expectedSize;
  }

  private healLegacyArtifactsSync(filePath: string, raw: string): void {
    const sizePath = this.sizeFilePath(filePath);
    const rawSize = String(Buffer.byteLength(raw, 'utf8'));

    if (!existsSync(sizePath)) {
      writeFileSync(sizePath, rawSize, 'utf8');
    }

    if (filePath !== this.cachePath) {
      return;
    }

    if (!existsSync(this.backup1Path)) {
      copyFileSync(this.cachePath, this.backup1Path);
      writeFileSync(this.sizeFilePath(this.backup1Path), rawSize, 'utf8');
    }

    if (!existsSync(this.backup2Path)) {
      copyFileSync(this.cachePath, this.backup2Path);
      writeFileSync(this.sizeFilePath(this.backup2Path), rawSize, 'utf8');
    }
  }

  private async copyIfExists(sourcePath: string, targetPath: string): Promise<void> {
    try {
      await fs.copyFile(sourcePath, targetPath);
    } catch (error: unknown) {
      if (this.isMissingFileError(error)) {
        return;
      }
      throw error;
    }
  }

  private copyIfExistsSync(sourcePath: string, targetPath: string): void {
    try {
      copyFileSync(sourcePath, targetPath);
    } catch (error: unknown) {
      if (this.isMissingFileError(error)) {
        return;
      }
      throw error;
    }
  }

  private isMissingFileError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT';
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private sizeFilePath(filePath: string): string {
    return `${filePath}_size`;
  }

  private async compressOnReadIfNeeded(candidatePath: string, storedRaw: string, decodedRaw: string): Promise<void> {
    if (!this.enableCompression || storedRaw.startsWith(COMPRESSED_PREFIX)) {
      return;
    }

    const compressedData = this.encodeForStorage(decodedRaw);
    await fs.writeFile(candidatePath, compressedData, 'utf8');

    if (this.enableBackups) {
      await fs.writeFile(this.sizeFilePath(candidatePath), String(Buffer.byteLength(compressedData, 'utf8')), 'utf8');
    }
  }

  private compressOnReadIfNeededSync(candidatePath: string, storedRaw: string, decodedRaw: string): void {
    if (!this.enableCompression || storedRaw.startsWith(COMPRESSED_PREFIX)) {
      return;
    }

    const compressedData = this.encodeForStorage(decodedRaw);
    writeFileSync(candidatePath, compressedData, 'utf8');

    if (this.enableBackups) {
      writeFileSync(this.sizeFilePath(candidatePath), String(Buffer.byteLength(compressedData, 'utf8')), 'utf8');
    }
  }

  private encodeForStorage(raw: string): string {
    if (!this.enableCompression) {
      return raw;
    }

    // Quality 1 is the fastest Brotli setting (~10x faster than quality 4 for
    // large payloads). Compression ratio drops slightly but CPU blocking drops
    // from ~300ms to <30ms on multi-MB caches.
    const compressed = brotliCompressSync(Buffer.from(raw, 'utf8'), {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 1,
      },
    });
    return `${COMPRESSED_PREFIX}${compressed.toString('base64')}`;
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
