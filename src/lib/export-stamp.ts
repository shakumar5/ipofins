import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ExportStamp {
  exportedAt: string;
  durationSec?: number;
}

/** Read public/data/.export-stamp.json written by export-client-data.mjs */
export function readExportStamp(root?: string): ExportStamp | null {
  const base = root ?? process.cwd();
  const path = join(base, 'public', 'data', '.export-stamp.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ExportStamp;
  } catch {
    return null;
  }
}

export function formatExportStampLabel(stamp: ExportStamp | null): string | null {
  if (!stamp?.exportedAt) return null;
  const d = new Date(stamp.exportedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
