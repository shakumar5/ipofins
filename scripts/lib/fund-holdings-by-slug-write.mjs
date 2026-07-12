/**
 * Write public/data/fund-holdings-by-slug/*.json without downgrading row counts.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeEquityHoldingRow, isInternationalEquityFund, sanitizeListingCodes } from './listing-codes.mjs';
import {
  enrichHoldingListingCodes,
  resolveStockSlugFromListing,
} from './stock-slug-lookup.mjs';
import { unpackMonthHoldings, latestMonthForFund } from './holdings-month.mjs';

/** Drop cached by-slug JSON so FORCE/DB export cannot leave orphan uncoded files. */
export function clearFundHoldingsBySlugDir(outDir) {
  if (!existsSync(outDir)) return 0;
  let removed = 0;
  for (const fileName of readdirSync(outDir)) {
    if (!fileName.endsWith('.json')) continue;
    unlinkSync(join(outDir, fileName));
    removed++;
  }
  return removed;
}

function holdingListingKey(row) {
  const { isin, nseSymbol, bseCode } = sanitizeListingCodes(row);
  if (isin) return `isin:${isin}`;
  if (nseSymbol) return `nse:${nseSymbol}`;
  if (bseCode) return `bse:${bseCode}`;
  return '';
}

/** Collapse duplicate listing rows; keep higher pct. */
export function dedupeMappedHoldingsByListing(mapped) {
  const byKey = new Map();
  const noKey = [];
  for (const row of mapped) {
    const key = holdingListingKey(row);
    if (!key) {
      noKey.push(row);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev || Number(row.pct) > Number(prev.pct)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values(), ...noKey];
}

export function mapStocksForBySlugExport(stocks, fundContext, lookups, slugListing) {
  const { isinMap, nseMap, bseMap } = lookups;
  const mapped = stocks
    .map((h) => {
      const listing = enrichHoldingListingCodes(h, slugListing);
      const normalized = normalizeEquityHoldingRow(
        {
          ...h,
          isin: listing.isin,
          nseSymbol: listing.nseSymbol,
          bseCode: listing.bseCode,
        },
        { slugToListing: slugListing, enrichFromSlug: false, fundContext },
      );
      if (!normalized) return null;
      return {
        name: normalized.name,
        stockSlug:
          String(h.stockSlug || h.stock_slug || '').trim() ||
          resolveStockSlugFromListing(
            normalized.isin,
            normalized.nseSymbol,
            normalized.bseCode,
            isinMap,
            nseMap,
            bseMap,
          ),
        isin: normalized.isin || '',
        nseSymbol: normalized.nseSymbol || '',
        bseCode: normalized.bseCode || '',
        sector: normalized.sector || '',
        pct: normalized.pct ?? 0,
      };
    })
    .filter(Boolean);
  return dedupeMappedHoldingsByListing(mapped);
}

export function readBySlugFile(outDir, slug) {
  const path = join(outDir, `${slug}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write by-slug file from the authoritative holdings source.
 * When force=true (DB export), always overwrite — financial data must match source exactly.
 */
export function writeBySlugFilePreservingFullest(outDir, slug, month, mappedStocks, { force = false } = {}) {
  if (!mappedStocks.length) return { written: false, skipped: true, rows: 0 };

  if (!force) {
    const existing = readBySlugFile(outDir, slug);
    const existingCount = Array.isArray(existing?.stocks) ? existing.stocks.length : 0;
    if (existingCount > mappedStocks.length) {
      return { written: false, skipped: true, rows: existingCount };
    }
  }

  writeFileSync(
    join(outDir, `${slug}.json`),
    JSON.stringify({ slug, month, stocks: mappedStocks }),
  );
  return { written: true, skipped: false, rows: mappedStocks.length };
}

export function writeFundHoldingsBySlugFromMergedHoldings(
  holdings,
  outDir,
  lookups,
  slugListing,
  { force = false } = {},
) {
  // Authoritative DB export must not keep stale cache/listable twins that lack listing codes.
  if (force) {
    const cleared = clearFundHoldingsBySlugDir(outDir);
    if (cleared) {
      console.log(`  ℹ Cleared ${cleared} cached fund-holdings-by-slug file(s) before DB write`);
    }
  }

  const months = holdings.months || [];
  let written = 0;
  let skipped = 0;
  let rows = 0;

  for (const [slug, fund] of Object.entries(holdings.holdings || {})) {
    const month = latestMonthForFund(fund, months);
    if (!month) continue;
    const { stocks } = unpackMonthHoldings(fund[month]);
    if (!stocks.length) continue;

    const fundContext = {
      fundSlug: slug,
      fundName: fund.name,
      internationalFund: isInternationalEquityFund(slug, fund.name),
    };
    const mapped = mapStocksForBySlugExport(stocks, fundContext, lookups, slugListing);
    const result = writeBySlugFilePreservingFullest(outDir, slug, month, mapped, { force });
    if (result.written) {
      written++;
      rows += result.rows;
    } else if (result.skipped) {
      skipped++;
      rows += result.rows;
    }
  }

  return { written, skipped, rows };
}
