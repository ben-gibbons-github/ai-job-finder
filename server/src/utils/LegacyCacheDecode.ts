import { brotliDecompressSync } from 'node:zlib';

const COMPRESSED_PREFIX = 'CBR1:';

export function decodeLegacyCachePayload(storedRaw: string): string {
  if (!String(storedRaw ?? '').startsWith(COMPRESSED_PREFIX)) {
    return String(storedRaw ?? '');
  }

  const payload = String(storedRaw).slice(COMPRESSED_PREFIX.length);
  const compressedBuffer = Buffer.from(payload, 'base64');
  return brotliDecompressSync(compressedBuffer).toString('utf8');
}
