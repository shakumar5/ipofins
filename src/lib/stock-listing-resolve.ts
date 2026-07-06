/** Resolve stock slugs from listing identifiers only: ISIN → NSE → BSE. */
import { sanitizeListingCodes, type ListingCodeInput } from './listing-codes';
export interface StockListingCodes {
  isin: string;
  nseSymbol: string;
  bseCode: string;
}

export type HoldingListingInput = ListingCodeInput & {
  stockSlug?: string | null;
  stock_slug?: string | null;
};

export function resolveStockSlugFromListing(
  isin: string | undefined | null,
  nse: string | undefined | null,
  bse: string | undefined | null,
  isinIndex: Map<string, string>,
  nseIndex: Map<string, string>,
  bseIndex: Map<string, string>,
): string | undefined {
  const isinCode = String(isin || '').trim().toUpperCase();
  if (isinCode) {
    const byIsin = isinIndex.get(isinCode);
    if (byIsin) return byIsin;
  }

  const nseCode = String(nse || '').trim().toUpperCase();
  if (nseCode) {
    const byNse = nseIndex.get(nseCode);
    if (byNse) return byNse;
  }

  const bseCode = String(bse || '').trim();
  if (bseCode) {
    const byBse = bseIndex.get(bseCode);
    if (byBse) return byBse;
  }

  return undefined;
}

/** Invert listing → slug indexes into slug → { isin, nse, bse } (no name matching). */
export function buildSlugToListingMap(
  isinIndex: Map<string, string>,
  nseIndex: Map<string, string>,
  bseIndex: Map<string, string>,
): Map<string, StockListingCodes> {
  const bySlug = new Map<string, StockListingCodes>();

  const touch = (slug: string): StockListingCodes => {
    const key = String(slug || '').trim();
    if (!key) return { isin: '', nseSymbol: '', bseCode: '' };
    const existing = bySlug.get(key);
    if (existing) return existing;
    const entry = { isin: '', nseSymbol: '', bseCode: '' };
    bySlug.set(key, entry);
    return entry;
  };

  for (const [isin, slug] of isinIndex) {
    const code = String(isin || '').trim().toUpperCase();
    if (!code) continue;
    touch(slug).isin = code;
  }
  for (const [nse, slug] of nseIndex) {
    const code = String(nse || '').trim().toUpperCase();
    if (!code) continue;
    touch(slug).nseSymbol = code;
  }
  for (const [bse, slug] of bseIndex) {
    const code = String(bse || '').trim();
    if (!code) continue;
    touch(slug).bseCode = code;
  }

  return bySlug;
}

export interface BhavcopyListingIndex {
  byIsin: Map<string, StockListingCodes>;
  byNse: Map<string, StockListingCodes>;
  byBse: Map<string, StockListingCodes>;
}

export function fillListingFromBhavcopy(
  codes: StockListingCodes,
  index?: BhavcopyListingIndex | null,
): StockListingCodes {
  if (!index) return codes;
  let isin = String(codes.isin || '').trim().toUpperCase();
  let nseSymbol = String(codes.nseSymbol || '').trim().toUpperCase();
  let bseCode = String(codes.bseCode || '').trim();

  if (!isin && !nseSymbol && !bseCode) {
    return { isin: '', nseSymbol: '', bseCode: '' };
  }

  let hit: StockListingCodes | undefined;
  if (isin) hit = index.byIsin.get(isin);
  else if (nseSymbol) hit = index.byNse.get(nseSymbol);
  else if (bseCode) hit = index.byBse.get(bseCode);

  if (!hit) return { isin, nseSymbol, bseCode };

  return {
    isin: isin || hit.isin || '',
    nseSymbol: nseSymbol || hit.nseSymbol || '',
    bseCode: bseCode || hit.bseCode || '',
  };
}

/**
 * Prefer row listing codes. Fill gaps from bhavcopy (ISIN/NSE/BSE cross-ref), then stockSlug map.
 */
export function enrichHoldingListingCodes(
  row: HoldingListingInput,
  slugToListing: Map<string, StockListingCodes>,
  bhavcopyIndex?: BhavcopyListingIndex | null,
): StockListingCodes {
  let filled = fillListingFromBhavcopy(sanitizeListingCodes(row), bhavcopyIndex);

  if (!filled.isin && !filled.nseSymbol && !filled.bseCode) {
    const slug = String(row.stockSlug || row.stock_slug || '').trim();
    if (!slug) return { isin: '', nseSymbol: '', bseCode: '' };
    const hit = slugToListing.get(slug);
    filled = fillListingFromBhavcopy(
      sanitizeListingCodes({
        isin: hit?.isin,
        nseSymbol: hit?.nseSymbol,
        bseCode: hit?.bseCode,
      }),
      bhavcopyIndex,
    );
  }

  return filled;
}
