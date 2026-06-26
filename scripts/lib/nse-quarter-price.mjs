/**
 * Quarter-end closing price for entity holding value (₹ Cr).
 * Primary: Yahoo Finance chart API. Fallback: NSE/BSE UDiFF bhavcopy.
 */
import { nseQuarterEndLabel } from './si-quarters.mjs';
import { fetchBhavcopyQuarterEndClose, clearBhavcopyCache } from './bhavcopy-price.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const priceCache = new Map();

/** ISO quarter start → { from, to } as DD-MM-YYYY (NSE labels). */
export function quarterEndDateRange(quarterStart) {
  const iso = String(quarterStart).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const year = parseInt(iso[1], 10);
  const startMonth = parseInt(iso[2], 10) - 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth + 1, 0);
  const qStart = new Date(year, startMonth, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  const endIso = `${year}-${pad(endMonth + 1)}-${pad(lastDay.getDate())}`;
  // Mar quarter: Mar 31 is often a non-trading day — price on 30-Mar (last session).
  const priceEndIso =
    endMonth === 2 && lastDay.getDate() === 31 ? `${year}-03-30` : endIso;
  return {
    from: fmt(qStart),
    to: fmt(lastDay),
    endLabel: nseQuarterEndLabel(quarterStart),
    startIso: `${year}-${pad(startMonth + 1)}-01`,
    endIso,
    priceEndIso,
  };
}

function yahooSymbol(nseSymbol, bseCode) {
  const nse = String(nseSymbol || '').trim().toUpperCase();
  if (nse) return `${nse}.NS`;
  const bse = String(bseCode || '').trim();
  if (bse) return `${bse}.BO`;
  return null;
}

async function fetchYahooClose(ysym, range) {
  const priceEnd = range.priceEndIso || range.endIso;
  const period1 = Math.floor(new Date(`${range.startIso}T00:00:00Z`).getTime() / 1000) - 86400;
  const period2 = Math.floor(new Date(`${priceEnd}T23:59:59Z`).getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && c > 0) return c;
    }
  } catch {
    /* fall through to bhavcopy */
  }
  return null;
}

/** Last trading-day close in the quarter (Yahoo → NSE/BSE bhavcopy). */
export async function fetchQuarterEndClose(nseSymbol, quarterStart, bseCode = null) {
  const nse = String(nseSymbol || '').trim().toUpperCase();
  const bse = String(bseCode || '').trim();
  if (!nse && !bse) return null;

  const range = quarterEndDateRange(quarterStart);
  if (!range) return null;

  const cacheKey = `${nse || '-'}|${bse || '-'}|${quarterStart}`;
  if (priceCache.has(cacheKey)) return priceCache.get(cacheKey);

  let close = null;

  const ysym = yahooSymbol(nseSymbol, bseCode);
  if (ysym) close = await fetchYahooClose(ysym, range);

  // BSE-only: Yahoo .BO; NSE-listed: NSE bhavcopy only (not BSE file).
  if (close == null) {
    close = await fetchBhavcopyQuarterEndClose(nseSymbol, quarterStart, bseCode, range);
  }

  priceCache.set(cacheKey, close);
  return close;
}

/** shares × quarter-end close → ₹ Cr (2 decimal places). */
export function holdingValueCr(shares, closePrice) {
  const sh = Number(shares);
  const px = Number(closePrice);
  if (!Number.isFinite(sh) || sh <= 0 || !Number.isFinite(px) || px <= 0) return null;
  return Math.round((sh * px) / 1e7 * 100) / 100;
}

export function clearPriceCache() {
  priceCache.clear();
  clearBhavcopyCache();
}
