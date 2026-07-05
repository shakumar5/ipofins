import {
  computeMultiFundOverlap,
  stockKey,
  type OverlapHolding,
  type PortfolioOverlapData,
} from './portfolio-overlap';

export interface UserHolding {
  fundSlug: string;
  amount: number;
}

export interface WeightedStock {
  name: string;
  isin: string;
  weightedPct: number;
  sector: string;
  fundCount: number;
}

export interface SectorSlice {
  sector: string;
  weightedPct: number;
}

export interface OverlapPair {
  fundA: string;
  fundB: string;
  overlapPct: number;
}

export interface XRayRiskMetrics {
  top5Concentration: number;
  top10Concentration: number;
  herfindahlIndex: number;
  uniqueStocks: number;
  fundCount: number;
}

export interface XRayResult {
  topStocks: WeightedStock[];
  sectorBreakdown: SectorSlice[];
  overlapMatrix: OverlapPair[];
  riskMetrics: XRayRiskMetrics;
  totalInvested: number;
  dataMonth: string;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\blimited\b|\bltd\.?\b|\binc\.?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Build stock-name → sector map from smart-money conviction export. */
export function buildSectorLookup(rows: { stockName: string; sector: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeName(row.stockName);
    if (key && row.sector && !map.has(key)) map.set(key, row.sector);
  }
  return map;
}

function resolveSector(name: string, sectorLookup: Map<string, string>): string {
  const direct = sectorLookup.get(normalizeName(name));
  if (direct) return direct;
  const words = normalizeName(name).split(' ').filter(Boolean);
  for (let len = Math.min(words.length, 4); len >= 1; len--) {
    const partial = words.slice(0, len).join(' ');
    const hit = sectorLookup.get(partial);
    if (hit) return hit;
  }
  return 'Other';
}

export function computeXRay(
  holdings: UserHolding[],
  data: PortfolioOverlapData,
  sectorLookup: Map<string, string>,
): XRayResult | null {
  const valid = holdings.filter((h) => h.amount > 0 && data.holdings[h.fundSlug]?.length);
  if (valid.length === 0) return null;

  const totalInvested = valid.reduce((s, h) => s + h.amount, 0);
  const stockMap = new Map<
    string,
    { name: string; isin: string; weightedPct: number; sectors: Map<string, number>; funds: Set<string> }
  >();

  for (const { fundSlug, amount } of valid) {
    const weight = amount / totalInvested;
    const rows = data.holdings[fundSlug] ?? [];
    for (const row of rows) {
      const key = stockKey(row);
      const contrib = row.pct * weight;
      const sector = resolveSector(row.name, sectorLookup);
      const existing = stockMap.get(key);
      if (existing) {
        existing.weightedPct += contrib;
        existing.funds.add(fundSlug);
        existing.sectors.set(sector, (existing.sectors.get(sector) ?? 0) + 1);
      } else {
        stockMap.set(key, {
          name: row.name,
          isin: row.isin,
          weightedPct: contrib,
          sectors: new Map([[sector, 1]]),
          funds: new Set([fundSlug]),
        });
      }
    }
  }

  const topStocks: WeightedStock[] = [...stockMap.values()]
    .map((s) => {
      const sector = [...s.sectors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';
      return {
        name: s.name,
        isin: s.isin,
        weightedPct: Math.round(s.weightedPct * 10) / 10,
        sector,
        fundCount: s.funds.size,
      };
    })
    .sort((a, b) => b.weightedPct - a.weightedPct);

  const sectorTotals = new Map<string, number>();
  for (const stock of topStocks) {
    sectorTotals.set(stock.sector, (sectorTotals.get(stock.sector) ?? 0) + stock.weightedPct);
  }
  const sectorBreakdown: SectorSlice[] = [...sectorTotals.entries()]
    .map(([sector, weightedPct]) => ({ sector, weightedPct: Math.round(weightedPct * 10) / 10 }))
    .sort((a, b) => b.weightedPct - a.weightedPct);

  const slugs = valid.map((h) => h.fundSlug);
  const overlapMatrix: OverlapPair[] = [];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const result = computeMultiFundOverlap([slugs[i], slugs[j]], data.holdings);
      if (result) {
        const fundA = data.funds.find((f) => f.slug === slugs[i])?.name ?? slugs[i];
        const fundB = data.funds.find((f) => f.slug === slugs[j])?.name ?? slugs[j];
        overlapMatrix.push({ fundA, fundB, overlapPct: result.overlapPct });
      }
    }
  }
  overlapMatrix.sort((a, b) => b.overlapPct - a.overlapPct);

  const pcts = topStocks.map((s) => s.weightedPct);
  const top5Concentration = Math.round(pcts.slice(0, 5).reduce((a, b) => a + b, 0) * 10) / 10;
  const top10Concentration = Math.round(pcts.slice(0, 10).reduce((a, b) => a + b, 0) * 10) / 10;
  const herfindahlIndex = Math.round(pcts.reduce((s, p) => s + (p / 100) ** 2, 0) * 10000) / 100;

  return {
    topStocks: topStocks.slice(0, 25),
    sectorBreakdown,
    overlapMatrix,
    riskMetrics: {
      top5Concentration,
      top10Concentration,
      herfindahlIndex,
      uniqueStocks: topStocks.length,
      fundCount: valid.length,
    },
    totalInvested,
    dataMonth: data.month,
  };
}

export function fundHoldingsPreview(
  slug: string,
  data: PortfolioOverlapData,
  limit = 5,
): OverlapHolding[] {
  return (data.holdings[slug] ?? []).slice(0, limit);
}
