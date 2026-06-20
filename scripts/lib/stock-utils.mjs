/** Stock name normalization & quality scoring for deduplication. */

export function normalizeStockName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\s+\d{2}\/\d{2}\/\d{4}\s*$/g, '')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\bltd\.?\b/g, 'ltd')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bltd\s*$/g, '')
    .trim();
}

const NON_EQUITY_SECTOR_LABELS = new Set(
  [
    'N.A.',
    'N.A',
    'NA',
    'N/A',
    'NOT APPLICABLE',
    'NOT AVAILABLE',
    'SOV',
    'SOVEREIGN',
    'SOVEREIGN SECURITIES',
    'STOCK FUTURE',
    'STOCK FUTURES',
    'INDEX FUTURE',
    'INDEX FUTURES',
    'FOREIGN SECURITY',
    'FOREIGN SECURITIES',
    'FOREIGN MUTUAL FUND',
    'FOREIGN MUTUAL FUNDS',
    'OVERSEAS MUTUAL FUND',
    'OVERSEAS MUTUAL FUNDS',
    'MUTUAL FUND',
    'MUTUAL FUNDS',
    'EXCHANGE TRADED FUND',
    'ETF',
    'CASH',
    'CASH & CASH EQUIVALENT',
    'CASH AND CASH EQUIVALENT',
    'TREASURY BILL',
    'T-BILL',
    'TBILL',
    'GOVERNMENT SECURITIES',
    'GOVT SECURITIES',
    'GOVT. SECURITIES',
    'CORPORATE BOND',
    'CORPORATE BONDS',
    'DEBT',
    'BONDS',
    'COMMERCIAL PAPER',
    'CERTIFICATE OF DEPOSIT',
    'MONEY MARKET',
    'FLOATING',
    'FIXED INCOME',
    'DERIVATIVES',
    'DERIVATIVE',
    'UNLISTED',
    'PREFERENCE SHARE',
    'PREFERENCE SHARES',
  ].map((s) => s.toUpperCase()),
);

export function isValidEquitySector(sector) {
  const s = String(sector || '').trim();
  if (!s || s === 'Unknown') return true;

  const upper = s.toUpperCase().replace(/\s+/g, ' ');
  if (NON_EQUITY_SECTOR_LABELS.has(upper)) return false;

  if (/^[\d.]+\s*%?$/.test(s)) return false;
  if (/^\[?(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork)/i.test(s)) return false;
  if (
    /^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Commercial Paper|Corporate Bond|Government|G\.?\s*Sec|Call|Term|Cash|Debt|Bond|Mutual Fund|Foreign|Overseas|Stock Future|Index Future|Exchange Traded|Derivative|Option|Future|Preference|Unlisted)/i.test(
      s,
    )
  ) {
    return false;
  }
  if (!/[a-zA-Z]/.test(s)) return false;

  return true;
}

export function filterTrackerSectorOptions(sectors) {
  const filtered = sectors.filter((s) => s === 'All' || isValidEquitySector(s));
  const rest = filtered.filter((s) => s !== 'All').sort((a, b) => a.localeCompare(b));
  return filtered.includes('All') ? ['All', ...rest] : rest;
}

export function isDebtInstrument(name, sector = '') {
  const s = String(sector || '').trim();
  if (/^\[?(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork)/i.test(s)) return true;
  if (/^(CRISIL|ICRA|FITCH|CARE|IND|BWR)\s/i.test(s)) return true;
  if (/^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Mutual Fund)/i.test(s)) return true;
  if (/^\d+\.?\d*\s*%\s/.test(name)) return true;
  if (/\(\d{2}\/\d{2}\/\d{4}\)/.test(name)) return true;
  if (/\d{2}\/\d{2}\/\d{4}\s*$/.test(name)) return true;
  if (/\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2,4}/i.test(name)) return true;
  if (/T-BILL|TBILL|GOI|G\.?SEC|DAYS?\s+\d/i.test(name)) return true;
  if (/\bNCD\b/i.test(name)) return true;
  return false;
}

export function stockQualityScore(stock, sectorName = '') {
  let score = 0;
  if (stock.isin) score += 100;
  if (sectorName && isValidEquitySector(sectorName)) score += 40;
  if (!/\d{2}\/\d{2}\/\d{4}/.test(stock.name)) score += 30;
  if (/\bLimited\b/i.test(stock.name)) score += 5;
  if (/\bLtd\.?\b/i.test(stock.name)) score += 3;
  score -= Math.min(stock.name.length, 120) / 50;
  return score;
}

export function stockGroupKey(stock) {
  if (stock.isin && String(stock.isin).trim()) return String(stock.isin).trim().toUpperCase();
  return `name:${normalizeStockName(stock.name)}`;
}

/** Resolve holdings stock names to DB stock ids (ISIN → normalized name → slug). */
export function buildStockIdResolver(stockRows, slugifyFn) {
  const stockIdBySlug = Object.fromEntries(stockRows.map((r) => [r.slug, r.id]));
  const stockIdByIsin = {};
  const stockIdByNormName = {};
  for (const r of stockRows) {
    if (r.isin) stockIdByIsin[String(r.isin).trim().toUpperCase()] = r.id;
    const norm = normalizeStockName(r.name);
    if (norm && stockIdByNormName[norm] === undefined) stockIdByNormName[norm] = r.id;
  }
  return function resolveStockId(holding) {
    const isin = holding.isin && String(holding.isin).trim();
    if (isin) {
      const byIsin = stockIdByIsin[isin.toUpperCase()];
      if (byIsin) return byIsin;
    }
    const norm = normalizeStockName(holding.name);
    if (norm && stockIdByNormName[norm]) return stockIdByNormName[norm];
    if (holding.name && slugifyFn) {
      const bySlug = stockIdBySlug[slugifyFn(holding.name)];
      if (bySlug) return bySlug;
    }
    return null;
  };
}
