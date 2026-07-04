/**
 * Post-listing price journey for listed IPOs.
 *
 * For each listed IPO we fetch the daily close series (Yahoo Finance chart API,
 * bhavcopy is intentionally not used here because it is quarter-anchored) and
 * read the close "as of" listing_date + {1w, 1m, 3m, 6m, 1y} plus the latest
 * close (current_price). Returns are expressed against the issue price so they
 * line up with what the detail page shows.
 *
 * Anything we cannot fetch stays null — the UI hides rows it has no data for,
 * so a partial result is always safe.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DAY_MS = 86_400_000;

/** Build the Yahoo ticker: NSE preferred (.NS), else BSE scrip (.BO). */
export function yahooSymbol(nseSymbol, bseCode) {
  const nse = String(nseSymbol || '').trim().toUpperCase();
  if (nse) return `${nse}.NS`;
  const bse = String(bseCode || '').trim();
  if (bse) return `${bse}.BO`;
  return null;
}

/**
 * Resolve a company name to NSE/BSE tickers via Yahoo Finance search.
 * Used as a fallback when the IPO isn't in the `stocks` master (fresh listings)
 * or when the master only has a BSE code Yahoo can't price. NSE (.NS) is
 * returned first. Callers must still name-check before trusting a result.
 * @returns {Promise<Array<{ symbol: string, name: string }>>}
 */
export async function searchYahooSymbols(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    q,
  )}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const quotes = Array.isArray(json?.quotes) ? json.quotes : [];
    const equities = quotes
      .filter(
        (item) =>
          typeof item?.symbol === 'string' &&
          (item.symbol.endsWith('.NS') || item.symbol.endsWith('.BO')) &&
          (item.quoteType === 'EQUITY' || !item.quoteType),
      )
      .map((item) => ({
        symbol: item.symbol,
        name: item.longname || item.shortname || '',
      }));
    // NSE first (Yahoo has richer .NS history than .BO SME series).
    equities.sort((a, b) => Number(b.symbol.endsWith('.NS')) - Number(a.symbol.endsWith('.NS')));
    return equities;
  } catch {
    return [];
  }
}

/** ISO date string or Date → epoch ms at UTC midnight (null if unparseable). */
export function toUtcMidnightMs(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? null
      : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function addDaysMs(ms, days) {
  return ms + days * DAY_MS;
}

/** Add calendar months at UTC (clamps to end-of-month, e.g. Jan 31 +1m → Feb 28). */
function addMonthsMs(ms, months) {
  const d = new Date(ms);
  const targetMonth = d.getUTCMonth() + months;
  const result = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, d.getUTCDate()));
  if (result.getUTCDate() !== d.getUTCDate()) {
    result.setUTCDate(0); // rolled into next month → step back to last valid day
  }
  return result.getTime();
}

/**
 * Daily close series from Yahoo Finance.
 * @returns {Promise<Array<{ ts: number, close: number }>>} ascending by ts (ms); [] on failure.
 */
export async function fetchYahooDailySeries(ysym, fromMs, toMs) {
  if (!ysym || fromMs == null) return [];
  const period1 = Math.floor(fromMs / 1000) - 2 * 86_400;
  const period2 = Math.floor((toMs ?? Date.now()) / 1000) + 2 * 86_400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ysym,
  )}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const stamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const out = [];
    for (let i = 0; i < stamps.length; i++) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && c > 0) {
        out.push({ ts: stamps[i] * 1000, close: Math.round(c * 100) / 100 });
      }
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  } catch {
    return [];
  }
}

/**
 * Last close on or before `targetMs`. Returns null if the target is in the
 * future relative to the series, or so far past the last point that we would be
 * guessing (staleGuardDays).
 */
export function closeAsOf(series, targetMs, staleGuardDays = 10) {
  if (!series?.length || targetMs == null) return null;
  let pick = null;
  for (const point of series) {
    if (point.ts <= targetMs + DAY_MS) pick = point;
    else break;
  }
  if (!pick) return null;
  if (targetMs - pick.ts > staleGuardDays * DAY_MS) return null;
  return pick.close;
}

function pct(price, issuePrice) {
  if (price == null || issuePrice == null || issuePrice <= 0) return null;
  return Math.round(((price - issuePrice) / issuePrice) * 100 * 100) / 100;
}

/**
 * Reduce a daily series to the post-listing snapshot columns.
 * Points whose target date is still in the future return null.
 */
export function computePostListingSnapshot({ listingMs, issuePrice, series, nowMs = Date.now() }) {
  const asOf = (targetMs) => (targetMs > nowMs ? null : closeAsOf(series, targetMs));

  const price1w = asOf(addDaysMs(listingMs, 7));
  const price1m = asOf(addMonthsMs(listingMs, 1));
  const price3m = asOf(addMonthsMs(listingMs, 3));
  const price6m = asOf(addMonthsMs(listingMs, 6));
  const price1y = asOf(addMonthsMs(listingMs, 12));
  const currentPrice = series.length ? series[series.length - 1].close : null;

  return {
    current_price: currentPrice,
    price_1w: price1w,
    price_1m: price1m,
    price_3m: price3m,
    price_6m: price6m,
    price_1y: price1y,
    return_1m_pct: pct(price1m, issuePrice),
    return_1y_pct: pct(price1y, issuePrice),
  };
}

/** True when a snapshot has at least one populated price column. */
export function snapshotHasData(snap) {
  return (
    snap.current_price != null ||
    snap.price_1w != null ||
    snap.price_1m != null ||
    snap.price_3m != null ||
    snap.price_6m != null ||
    snap.price_1y != null
  );
}
