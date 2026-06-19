export interface OverlapHolding {
  name: string;
  isin: string;
  pct: number;
}

export interface OverlapFund {
  slug: string;
  name: string;
  amc: string;
}

export interface PortfolioOverlapData {
  month: string;
  funds: OverlapFund[];
  holdings: Record<string, OverlapHolding[]>;
}

export interface OverlapResult {
  overlapPct: number;
  commonHoldings: string[];
  commonCount: number;
}

export function fundHasHoldings(data: PortfolioOverlapData, slug: string): boolean {
  return Boolean(slug && data.holdings[slug]?.length);
}

export function stockKey(holding: OverlapHolding): string {
  const isin = holding.isin?.trim().toUpperCase();
  if (isin && /^IN[0E][A-Z0-9]{9}$/.test(isin)) return isin;
  return `name:${holding.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

/** Sum of min(weights) across stocks held by every selected fund (same as pairwise formula for N=2). */
export function computeMultiFundOverlap(
  selectedSlugs: string[],
  holdings: Record<string, OverlapHolding[]>,
): OverlapResult | null {
  const maps = selectedSlugs
    .map((slug) => {
      const rows = holdings[slug];
      if (!rows?.length) return null;
      const map = new Map<string, OverlapHolding>();
      for (const row of rows) {
        map.set(stockKey(row), row);
      }
      return map;
    })
    .filter((m): m is Map<string, OverlapHolding> => m != null);

  if (maps.length < 2 || maps.length !== selectedSlugs.length) return null;

  let keys = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) {
    const set = new Set(maps[i].keys());
    keys = keys.filter((k) => set.has(k));
  }

  let overlapPct = 0;
  const commonHoldings: string[] = [];

  for (const key of keys) {
    const pcts = maps.map((m) => m.get(key)!.pct);
    overlapPct += Math.min(...pcts);
    const displayName = maps
      .map((m) => m.get(key)!.name)
      .sort((a, b) => b.length - a.length)[0];
    commonHoldings.push(displayName);
  }

  commonHoldings.sort((a, b) => a.localeCompare(b));

  return {
    overlapPct: Math.round(overlapPct * 10) / 10,
    commonHoldings,
    commonCount: commonHoldings.length,
  };
}
