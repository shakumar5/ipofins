/**
 * Shared holdings merge helpers (parser JSON + DB).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { unpackMonthHoldings } from './holdings-month.mjs';
import { normalizeEquityHoldingRow, isInternationalEquityFund } from './listing-codes.mjs';
import { sql, withDbRetry } from './db.mjs';
import { HOLDINGS_SLUG_REMAPS } from './fund-match.mjs';

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function sortMonthLabels(months) {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    if (ya !== yb) return Number(ya) - Number(yb);
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
  });
}

export function compactHoldings(raw) {
  const holdings = {};
  for (const [slug, fund] of Object.entries(raw.holdings || {})) {
    const entry = { name: fund.name, amc: fund.amc };
    for (const [key, val] of Object.entries(fund)) {
      if (key === 'name' || key === 'amc') continue;
      const { stocks } = unpackMonthHoldings(val);
      if (stocks.length) {
        const fundContext = {
          fundSlug: slug,
          fundName: fund.name,
          internationalFund: isInternationalEquityFund(slug, fund.name),
        };
        entry[key] = stocks
          .map((h) => normalizeEquityHoldingRow(h, { enrichFromSlug: false, fundContext }))
          .filter(Boolean)
          .map((h) => ({
            name: h.name,
            isin: h.isin || '',
            stockSlug: h.stockSlug || '',
            nseSymbol: h.nseSymbol || '',
            bseCode: h.bseCode || '',
            sector: h.sector || '',
            pct: h.pct ?? 0,
          }));
      }
    }
    holdings[slug] = entry;
  }
  return {
    months: raw.months || [],
    amcs: raw.amcs || {},
    holdings,
  };
}

/** Prefer the source with more equity rows per fund/month (never trust totalStocks alone). */
export function mergeHoldingsPreferMoreStocks(primary, supplemental) {
  if (!supplemental?.holdings) return primary;
  if (!primary?.holdings) return supplemental;
  const merged = {
    ...primary,
    months: sortMonthLabels([...new Set([...(primary.months || []), ...(supplemental.months || [])])]),
    amcs: { ...(supplemental.amcs || {}), ...(primary.amcs || {}) },
    holdings: { ...primary.holdings },
  };
  const months = merged.months;
  for (const [slug, fund] of Object.entries(supplemental.holdings)) {
    for (const month of months) {
      const fromExtra = unpackMonthHoldings(fund[month]);
      if (!fromExtra.stocks.length) continue;
      if (!merged.holdings[slug]) {
        merged.holdings[slug] = { name: fund.name, amc: fund.amc };
      }
      const entry = merged.holdings[slug];
      const fromPrimary = unpackMonthHoldings(entry[month]);
      if (fromExtra.stocks.length > fromPrimary.stocks.length) {
        const fundContext = {
          fundSlug: slug,
          fundName: fund.name || entry.name,
          internationalFund: isInternationalEquityFund(slug, fund.name || entry.name),
        };
        entry[month] = fromExtra.stocks
          .map((h) => normalizeEquityHoldingRow(h, { enrichFromSlug: false, fundContext }))
          .filter(Boolean)
          .map((h) => ({
            name: h.name,
            isin: h.isin || '',
            stockSlug: h.stockSlug || '',
            nseSymbol: h.nseSymbol || '',
            bseCode: h.bseCode || '',
            sector: h.sector || '',
            pct: h.pct ?? 0,
          }));
      }
    }
  }
  return merged;
}

function mapMonthStocksForExport(stocks, slug, fundName) {
  const fundContext = {
    fundSlug: slug,
    fundName,
    internationalFund: isInternationalEquityFund(slug, fundName),
  };
  return stocks
    .map((h) => normalizeEquityHoldingRow(h, { enrichFromSlug: false, fundContext }))
    .filter(Boolean)
    .map((h) => ({
      name: h.name,
      isin: h.isin || '',
      stockSlug: h.stockSlug || '',
      nseSymbol: h.nseSymbol || '',
      bseCode: h.bseCode || '',
      sector: h.sector || '',
      pct: h.pct ?? 0,
    }));
}

function fundMonthStockCount(fund, months) {
  let best = 0;
  for (const month of months) {
    const { stocks } = unpackMonthHoldings(fund?.[month]);
    if (stocks.length > best) best = stocks.length;
  }
  return best;
}

/**
 * International funds are often missing from DB export (no Indian stock_id join).
 * Overlay parser rows when DB has fewer or no rows for those funds.
 */
export function overlayInternationalHoldingsFromParser(dbHoldings, parserHoldings) {
  if (!parserHoldings?.holdings) return dbHoldings;
  if (!dbHoldings?.holdings) return parserHoldings;

  const merged = {
    ...dbHoldings,
    months: sortMonthLabels([
      ...new Set([...(dbHoldings.months || []), ...(parserHoldings.months || [])]),
    ]),
    amcs: { ...(dbHoldings.amcs || {}), ...(parserHoldings.amcs || {}) },
    holdings: { ...dbHoldings.holdings },
  };
  const months = merged.months;
  let overlaid = 0;

  for (const [slug, fund] of Object.entries(parserHoldings.holdings)) {
    if (!isInternationalEquityFund(slug, fund.name)) continue;

    const parserCount = fundMonthStockCount(fund, months);
    if (!parserCount) continue;

    const dbCount = fundMonthStockCount(merged.holdings[slug], months);
    if (dbCount >= parserCount) continue;

    let bestMonth = null;
    let bestStocks = [];
    for (const month of months) {
      const { stocks } = unpackMonthHoldings(fund[month]);
      if (stocks.length > bestStocks.length) {
        bestMonth = month;
        bestStocks = stocks;
      }
    }
    if (!bestMonth || !bestStocks.length) continue;

    const mapped = mapMonthStocksForExport(bestStocks, slug, fund.name);
    if (!mapped.length) continue;

    merged.holdings[slug] = { name: fund.name, amc: fund.amc, [bestMonth]: mapped };
    overlaid++;

    if (!slug.endsWith('-direct-plan')) {
      const directSlug = `${slug}-direct-plan`;
      merged.holdings[directSlug] = {
        name: fund.name,
        amc: fund.amc,
        [bestMonth]: mapped,
      };
    }
  }

  if (overlaid) {
    console.log(`  ℹ Parser overlay for ${overlaid} international fund(s) missing from DB`);
  }
  return merged;
}

/**
 * Copy holdings from mangled disclosure slugs onto AMFI/page canonicals so by-slug
 * and aliases share the same file (e.g. Capitalmind open-ended → capitalmind-flexi-cap-fund).
 */
export function applyHoldingsSlugRemaps(holdings, remaps = HOLDINGS_SLUG_REMAPS) {
  if (!holdings?.holdings || !remaps) return holdings;
  const out = {
    ...holdings,
    holdings: { ...holdings.holdings },
  };
  let remapped = 0;
  for (const [fromSlug, toSlug] of Object.entries(remaps)) {
    if (!fromSlug || !toSlug || fromSlug === toSlug) continue;
    const from = out.holdings[fromSlug];
    if (!from) continue;

    const months = sortMonthLabels([
      ...new Set([
        ...(holdings.months || []),
        ...Object.keys(from).filter((k) => k !== 'name' && k !== 'amc'),
      ]),
    ]);

    if (!out.holdings[toSlug]) {
      out.holdings[toSlug] = { name: from.name, amc: from.amc };
    }
    const dest = out.holdings[toSlug];
    let copiedMonth = false;
    for (const month of months) {
      const fromPack = unpackMonthHoldings(from[month]);
      if (!fromPack.stocks.length) continue;
      const destPack = unpackMonthHoldings(dest[month]);
      if (fromPack.stocks.length >= destPack.stocks.length) {
        dest[month] = fromPack.stocks;
        copiedMonth = true;
      }
    }
    if (copiedMonth) {
      if (!dest.name) dest.name = from.name;
      if (!dest.amc) dest.amc = from.amc;
      remapped++;
    }
  }
  if (remapped) {
    console.log(`  ℹ Remapped ${remapped} mangled holdings slug(s) → canonical page slug(s)`);
  }
  return out;
}

export function loadHoldingsFromJson(root = process.cwd()) {
  const path = join(root, 'src', 'data', 'fund-holdings.json');
  if (!existsSync(path)) return null;
  return compactHoldings(JSON.parse(readFileSync(path, 'utf-8')));
}

export async function loadHoldingsFromDb() {
  return withDbRetry(async () => {
    const rows = await sql`
      SELECT
        f.slug,
        f.name AS fund_name,
        a.name AS amc_name,
        a.slug AS amc_slug,
        TRIM(TO_CHAR(fh.month, 'FMMonth YYYY')) AS month_label,
        s.name AS stock_name,
        s.slug AS stock_slug,
        COALESCE(s.isin, '') AS isin,
        COALESCE(s.nse_symbol, '') AS nse_symbol,
        COALESCE(s.bse_code, '') AS bse_code,
        COALESCE(sec.name, '') AS sector,
        fh.pct_to_nav AS pct
      FROM fund_holdings fh
      JOIN funds f ON f.id = fh.fund_id AND f.is_active = true
      JOIN amcs a ON a.id = f.amc_id
      JOIN stocks s ON s.id = fh.stock_id
      LEFT JOIN sectors sec ON sec.id = s.sector_id
      ORDER BY fh.month, a.name, f.name
    `;

    const monthsSet = new Set();
    const holdings = {};
    const amcFunds = new Map();
    const amcSlugs = new Map();

    for (const r of rows) {
      const slug = String(r.slug);
      const month = String(r.month_label).trim();
      const amc = String(r.amc_name);
      const amcSlug = String(r.amc_slug || '');
      const fundName = String(r.fund_name);
      monthsSet.add(month);
      if (amcSlug) amcSlugs.set(amc, amcSlug);

      if (!holdings[slug]) {
        holdings[slug] = { name: fundName, amc };
        if (!amcFunds.has(amc)) amcFunds.set(amc, new Set());
        amcFunds.get(amc).add(fundName);
      }
      if (!holdings[slug][month]) holdings[slug][month] = [];
      holdings[slug][month].push({
        name: String(r.stock_name),
        stockSlug: String(r.stock_slug),
        isin: String(r.isin),
        nseSymbol: String(r.nse_symbol || ''),
        bseCode: String(r.bse_code || ''),
        sector: String(r.sector),
        pct: r.pct != null ? Number(r.pct) : 0,
      });
    }

    const amcs = {};
    for (const [amc, names] of amcFunds) amcs[amc] = [...names].sort();

    const compact = compactHoldings({
      months: sortMonthLabels([...monthsSet]),
      amcs,
      holdings,
    });
    compact.amcSlugs = Object.fromEntries(amcSlugs);
    return compact;
  }, { label: 'Load holdings from DB' });
}
