import { getAllFunds, getHoldingsStats, getFundHoldingsLinkMeta } from './data/funds';
import { selectBestFunds } from './best-funds';
import { resolveDetailSlug } from './fund-detail-slug';

export interface MfHubFundRow {
  name: string;
  slug: string;
  category: string;
  nav: number | null;
  returns1y?: number | null;
  returns3y?: number | null;
  returns5y?: number | null;
  rating?: number | null;
  aum?: string | null;
  riskLevel: string;
  hasHoldings?: boolean;
  stockCount?: number;
  detailSlug?: string | null;
}

function toTableRow(
  f: {
    name: string;
    slug: string;
    category: string;
    nav: number | null;
    returns1y?: number | null;
    returns3y?: number | null;
    returns5y?: number | null;
    rating?: number | null;
    aum?: string | null;
    riskLevel: string;
    schemeCode?: string;
  },
  holdingSlugs: Set<string>,
  holdingStockCounts: Record<string, number>,
): MfHubFundRow {
  const detailSlug = resolveDetailSlug(f.slug, f.schemeCode ?? '', holdingSlugs, holdingStockCounts);
  return {
    name: f.name,
    slug: f.slug,
    category: f.category,
    nav: f.nav,
    returns1y: f.returns1y,
    returns3y: f.returns3y,
    returns5y: f.returns5y,
    rating: f.rating,
    aum: f.aum,
    riskLevel: f.riskLevel,
    hasHoldings: detailSlug != null,
    stockCount: detailSlug ? (holdingStockCounts[detailSlug] ?? 0) : 0,
    detailSlug,
  };
}

export async function getMfHubBuildData() {
  const fundsData = await getAllFunds();
  const { slugs: holdingSlugs, stockCounts: holdingStockCounts } = await getFundHoldingsLinkMeta();
  const { amcCount, fundsCovered: fundCount, latestMonth } = await getHoldingsStats();

  const categories = [...new Set(fundsData.map((f) => f.category))].sort((a, b) => a.localeCompare(b));
  const bestFunds = selectBestFunds(fundsData);

  const latestUpdate = fundsData.reduce((latest, f) => {
    if (f.lastUpdated && f.lastUpdated > latest) return f.lastUpdated;
    return latest;
  }, '');
  const dataDate = latestUpdate
    ? new Date(latestUpdate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'N/A';

  return {
    bestFundsForTable: bestFunds.map((f) => toTableRow(f, holdingSlugs, holdingStockCounts)),
    allFundsForTable: fundsData.map((f) => toTableRow(f, holdingSlugs, holdingStockCounts)),
    categories,
    holdingSlugs: Array.from(holdingSlugs),
    holdingStockCounts,
    holdingsCount: holdingSlugs.size,
    totalFunds: fundsData.length,
    bestFundsCount: bestFunds.length,
    amcCount,
    fundCount,
    latestMonth: latestMonth || '',
    dataDate,
  };
}
