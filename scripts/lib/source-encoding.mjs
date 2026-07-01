/**
 * Detect and repair UTF-16 text files (common on Windows when editors/agents
 * write wide-char encoding). Astro/TS require UTF-8.
 */
import { readFileSync, writeFileSync } from 'fs';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.astro',
  '.mjs',
  '.js',
  '.cjs',
  '.json',
  '.md',
  '.mdc',
  '.css',
  '.sql',
  '.yml',
  '.yaml',
  '.html',
  '.sh',
]);

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.vercel',
  'public',
]);

export function isTextSourcePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  if (SKIP_DIR_NAMES.has(normalized.split('/').find(Boolean) || '')) return false;
  if (/\/public\/data\//.test(normalized)) return false;
  const dot = normalized.lastIndexOf('.');
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(normalized.slice(dot).toLowerCase());
}

/** @returns {'utf16-le-bom' | 'utf16-be-bom' | 'utf16-le' | 'utf8-bom' | 'utf8'} */
export function detectTextEncoding(buffer) {
  if (!buffer || buffer.length === 0) return 'utf8';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf16-le-bom';
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf16-be-bom';
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf8-bom';
  }
  if (looksLikeUtf16Le(buffer)) return 'utf16-le';
  return 'utf8';
}

function looksLikeUtf16Le(buffer) {
  const sample = Math.min(buffer.length, 400);
  if (sample < 8) return false;

  let pairs = 0;
  let nulls = 0;
  for (let i = 0; i < sample - 1; i += 2) {
    const ch = buffer[i];
    const hi = buffer[i + 1];
    if (hi === 0 && ch >= 0x09 && ch <= 0x7e) pairs++;
    if (ch === 0) nulls++;
  }
  if (pairs >= 12) return true;

  // Dense NUL bytes (corrupted UTF-16 read as binary)
  return nulls > sample * 0.2;
}

export function isBrokenForTooling(encoding) {
  return encoding === 'utf16-le-bom' || encoding === 'utf16-be-bom' || encoding === 'utf16-le';
}

export function decodeToUtf8String(buffer, encoding = detectTextEncoding(buffer)) {
  switch (encoding) {
    case 'utf16-le-bom':
      return buffer.subarray(2).toString('utf16le');
    case 'utf16-be-bom': {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let i = 2; i < buffer.length; i += 2) {
        swapped[i - 2] = buffer[i + 1];
        swapped[i - 1] = buffer[i];
      }
      return swapped.toString('utf16le');
    }
    case 'utf16-le':
      return buffer.toString('utf16le');
    case 'utf8-bom':
      return buffer.subarray(3).toString('utf8');
    default:
      return buffer.toString('utf8');
  }
}

export function writeUtf8NoBom(filePath, text) {
  writeFileSync(filePath, text, { encoding: 'utf8' });
}

/**
 * @returns {{ encoding: string, repaired: boolean }}
 */
export function repairFileToUtf8(filePath) {
  const buffer = readFileSync(filePath);
  const encoding = detectTextEncoding(buffer);
  if (!isBrokenForTooling(encoding)) {
    return { encoding, repaired: false };
  }
  const text = decodeToUtf8String(buffer, encoding);
  writeUtf8NoBom(filePath, text);
  return { encoding, repaired: true };
}

export function inspectFileEncoding(filePath) {
  const buffer = readFileSync(filePath);
  const encoding = detectTextEncoding(buffer);
  return { encoding, broken: isBrokenForTooling(encoding) };
}
