/** Client-safe formatting helpers (no DB / Neon imports). */

export function toNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatCr(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n == null || n === 0) return '—';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(2) + 'k Cr';
  if (n < 1 && n > 0) return '₹' + (n * 100).toFixed(1) + ' L';
  return '₹' + n.toFixed(1) + ' Cr';
}

export function formatPct(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n == null) return '—';
  return n.toFixed(2) + '%';
}
