import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveMfFundHoldings } from './mf-hub-holdings-meta.mjs';

function toTableRow(f, meta) {
  const holdings = resolveMfFundHoldings(f, meta);
  return {
    name: f.name,
    slug: f.slug,
    category: f.category,
    nav: f.nav ?? null,
    returns1y: f.returns1y ?? null,
    returns3y: f.returns3y ?? null,
    returns5y: f.returns5y ?? null,
    rating: f.rating ?? null,
    aum: f.aum ?? null,
    riskLevel: f.riskLevel || 'medium',
    hasHoldings: holdings.hasHoldings,
    stockCount: holdings.stockCount,
    detailSlug: holdings.detailSlug,
  };
}

/** Same rules as src/lib/best-funds.ts */
export function selectBestFunds(funds) {
  const categories = [...new Set(funds.map((f) => f.category))];
  const top5ByCat = new Set();
  for (const cat of categories) {
    funds
      .filter((f) => f.category === cat)
      .sort((a, b) => (b.returns3y ?? -Infinity) - (a.returns3y ?? -Infinity))
      .slice(0, 5)
      .forEach((f) => top5ByCat.add(f.slug));
  }
  const fiveStar = new Set(funds.filter((f) => f.rating === 5).map((f) => f.slug));
  const top10By1Y = new Set(
    [...funds]
      .sort((a, b) => (b.returns1y ?? -Infinity) - (a.returns1y ?? -Infinity))
      .slice(0, 10)
      .map((f) => f.slug),
  );
  return funds.filter((f) => {
    let score = 0;
    if (top5ByCat.has(f.slug)) score++;
    if (fiveStar.has(f.slug)) score++;
    if (top10By1Y.has(f.slug)) score++;
    return top5ByCat.has(f.slug) || score >= 2;
  });
}

export function loadMutualFundsJson(root) {
  const path = join(root, 'src', 'data', 'mutual-funds.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildMfHubExports(funds, holdingsMeta, stats = {}) {
  const categories = [...new Set(funds.map((f) => f.category))].sort((a, b) => a.localeCompare(b));
  const bestFunds = selectBestFunds(funds);
  const latestUpdate = funds.reduce((latest, f) => {
    if (f.lastUpdated && f.lastUpdated > latest) return f.lastUpdated;
    return latest;
  }, '');
  const dataDate = latestUpdate
    ? new Date(latestUpdate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'N/A';

  const withHoldings = funds.filter((f) => resolveMfFundHoldings(f, holdingsMeta).hasHoldings);

  return {
    meta: {
      categories,
      bestFundsCount: bestFunds.length,
      totalFunds: funds.length,
      holdingsCount: withHoldings.length,
      dataDate,
      amcCount: stats.amcCount ?? 0,
      fundCount: stats.fundCount ?? withHoldings.length,
      latestMonth: stats.latestMonth ?? '',
    },
    best: bestFunds.map((f) => toTableRow(f, holdingsMeta)),
    all: funds.map((f) => toTableRow(f, holdingsMeta)),
  };
}
