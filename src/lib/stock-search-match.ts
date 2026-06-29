/** Match stock search queries against ISIN, NSE, BSE, name, slug, and acronym. */

const NAME_STOP_WORDS = new Set([
  'limited',
  'ltd',
  'inc',
  'corp',
  'corporation',
  'company',
  'co',
  'india',
  'enterprises',
  'enterprise',
  'holdings',
  'international',
]);

function significantNameWords(name: string): string[] {
  return name
    .replace(/[^a-zA-Z0-9\s&]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !NAME_STOP_WORDS.has(word.toLowerCase()));
}

/** e.g. Tata Consultancy Services → TCS */
export function stockNameAcronym(stockName: string): string {
  return significantNameWords(stockName)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/** Embedded tickers in official names: HDFC Bank, LTIMindtree, etc. */
function uppercaseTokens(stockName: string): string[] {
  const tokens = stockName.match(/\b[A-Z]{2,}\b/g) || [];
  const embedded = stockName.match(/[A-Z]{2,}(?=[a-z])/g) || [];
  return [...new Set([...tokens, ...embedded])].map((t) => t.toLowerCase());
}

function normIsin(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normNse(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function normBse(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function stockMatchesSearchQuery(
  stockName: string,
  stockSlug: string,
  query: string,
  nseSymbol?: string | null,
  isin?: string | null,
  bseCode?: string | null,
): boolean {
  const q = query.trim();
  if (q.length < 2) return false;

  const qUpper = q.toUpperCase();
  const qLower = q.toLowerCase();

  const isinNorm = normIsin(isin);
  if (isinNorm) {
    const qIsin = normIsin(q);
    if (qIsin.length >= 10 && isinNorm === qIsin) return true;
    if (qIsin.length >= 4 && isinNorm.includes(qIsin)) return true;
  }

  const symbol = normNse(nseSymbol);
  if (symbol && (symbol === qUpper || symbol.includes(qUpper) || qUpper.includes(symbol))) return true;

  const bse = normBse(bseCode);
  if (bse && (bse === q || bse.includes(q) || q.includes(bse))) return true;

  const name = stockName.toLowerCase();
  if (name.includes(qLower)) return true;

  const slug = stockSlug.toLowerCase();
  if (slug.includes(qLower)) return true;
  if (slug.replace(/-/g, '').includes(qLower)) return true;

  const acronym = stockNameAcronym(stockName).toLowerCase();
  if (acronym.length >= 2 && (acronym === qLower || acronym.startsWith(qLower))) return true;

  for (const token of uppercaseTokens(stockName)) {
    if (token.includes(qLower) || qLower.includes(token)) return true;
  }

  return false;
}

export interface StockSearchOption {
  slug: string;
  name: string;
  nseSymbol?: string | null;
  isin?: string | null;
  bseCode?: string | null;
}

function stockSearchRank(s: StockSearchOption, query: string): number {
  const q = query.trim();
  const qUpper = q.toUpperCase();
  const qLower = q.toLowerCase();
  const isin = normIsin(s.isin);
  const symbol = normNse(s.nseSymbol);
  const bse = normBse(s.bseCode);

  if (isin && isin === normIsin(q)) return 0;
  if (symbol && symbol === qUpper) return 1;
  if (bse && bse === q) return 2;
  if (stockNameAcronym(s.name).toLowerCase() === qLower) return 3;
  if (s.name.toLowerCase() === qLower) return 4;
  if (s.name.toLowerCase().startsWith(qLower)) return 5;
  return 6;
}

export function filterStockSearchQuery(
  query: string,
  stocks: StockSearchOption[],
  limit = 12,
): StockSearchOption[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return stocks
    .filter((s) => stockMatchesSearchQuery(s.name, s.slug, q, s.nseSymbol, s.isin, s.bseCode))
    .sort((a, b) => stockSearchRank(a, query) - stockSearchRank(b, query) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function matchStockSearchQuery(
  query: string,
  stocks: StockSearchOption[],
): StockSearchOption | null {
  return filterStockSearchQuery(query, stocks, 1)[0] ?? null;
}
