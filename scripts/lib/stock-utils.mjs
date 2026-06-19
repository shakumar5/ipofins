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

export function isValidEquitySector(sector) {
  const s = String(sector || '').trim();
  if (!s || s === 'Unknown') return true;
  if (/^\d+$/.test(s)) return false;
  if (/^\[?(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork)/i.test(s)) return false;
  if (/^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Mutual Fund)/i.test(s)) return true;
  return true;
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
