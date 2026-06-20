/** Match stock signal search queries against name, slug, acronym, and NSE symbol. */

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

export function stockMatchesSearchQuery(
  stockName: string,
  stockSlug: string,
  query: string,
  nseSymbol?: string | null,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;

  const name = stockName.toLowerCase();
  if (name.includes(q)) return true;

  const slug = stockSlug.toLowerCase();
  if (slug.includes(q)) return true;
  if (slug.replace(/-/g, '').includes(q)) return true;

  const symbol = String(nseSymbol || '').trim().toLowerCase();
  if (symbol && (symbol.includes(q) || q.includes(symbol))) return true;

  const acronym = stockNameAcronym(stockName).toLowerCase();
  if (acronym.length >= 2 && (acronym === q || acronym.startsWith(q))) return true;

  for (const token of uppercaseTokens(stockName)) {
    if (token.includes(q) || q.includes(token)) return true;
  }

  return false;
}
