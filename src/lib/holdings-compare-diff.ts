import { yieldToMain } from './client-data';
import { WEIGHT_CHANGE_THRESHOLD } from './holdings-utils';

export interface Holding {
  name: string;
  isin: string;
  sector: string;
  pct: number;
}

export interface FundHoldings {
  name: string;
  amc: string;
  [month: string]: Holding[] | string;
}

const YIELD_EVERY_N_FUNDS = 3;

export interface FundComparison {
  fundName: string;
  category: string;
  additions: { name: string; sector: string; pct: number }[];
  removals: { name: string; sector: string; pct: number }[];
  increased: { name: string; sector: string; oldPct: number; newPct: number }[];
  decreased: { name: string; sector: string; oldPct: number; newPct: number }[];
}

function isDebtHolding(h: Holding): boolean {
  if (h.sector && /^(CRISIL|ICRA|FITCH|CARE|IND|BWR)\s/i.test(h.sector)) return true;
  if (h.sector && /^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Mutual Fund)/i.test(h.sector)) return true;
  if (/^\d+\.?\d*\s*%\s/.test(h.name)) return true;
  if (/\(\d{2}\/\d{2}\/\d{4}\)/.test(h.name)) return true;
  if (/\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2,4}/i.test(h.name)) return true;
  if (/T-BILL|TBILL|GOI|G\.?SEC|DAYS?\s+\d/i.test(h.name)) return true;
  if (/\bNCD\b/i.test(h.name)) return true;
  if (/\(ZCB\)/i.test(h.name)) return true;
  if (/securitisation trust/i.test(h.name)) return true;
  if (/\bREIT\b|\bInvIT\b/i.test(h.name)) return true;
  if (/\bPTC\b/i.test(h.name)) return true;
  if (/commercial paper/i.test(h.name)) return true;
  if (/\bfund\b.*\b(direct|growth|plan)\b/i.test(h.name)) return true;
  return false;
}

function getFundCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('large cap') || n.includes('largecap') || n.includes('large & mid') || n.includes('large and mid')) {
    if (n.includes('& mid') || n.includes('and mid')) return 'Large & Mid Cap';
    return 'Large Cap';
  }
  if (n.includes('mid cap') || n.includes('midcap')) return 'Mid Cap';
  if (n.includes('multi cap') || n.includes('multicap')) return 'Multi Cap';
  if (n.includes('flexi') || n.includes('flexicap')) return 'Flexi Cap';
  if (n.includes('small cap') || n.includes('smallcap')) return 'Small Cap';
  return 'Others';
}

function compareSingleFund(
  fund: FundHoldings,
  month1: string,
  month2: string,
  selectedFund: string,
  selectedCategory: string,
): FundComparison | null {
  if (/^(Industry|Market|Rating|Quantity|Value|ISIN|%)/i.test(fund.name)) return null;
  if (/Fair Value|Rs\.?\s*in\s*Lacs/i.test(fund.name)) return null;

  const fundCat = getFundCategory(fund.name);
  if (selectedCategory !== 'All' && fundCat !== selectedCategory) return null;
  if (selectedFund !== 'All' && fund.name !== selectedFund) return null;

  const oldHoldings = ((fund[month1] as Holding[] | undefined) || []).filter((h) => !isDebtHolding(h));
  const newHoldings = ((fund[month2] as Holding[] | undefined) || []).filter((h) => !isDebtHolding(h));
  if (oldHoldings.length === 0 || newHoldings.length === 0) return null;

  const oldMap = new Map(oldHoldings.map((h) => [h.isin || h.name, h]));
  const newMap = new Map(newHoldings.map((h) => [h.isin || h.name, h]));

  const additions: FundComparison['additions'] = [];
  const removals: FundComparison['removals'] = [];
  const increased: FundComparison['increased'] = [];
  const decreased: FundComparison['decreased'] = [];

  for (const [key, h] of newMap) {
    if (!oldMap.has(key)) {
      additions.push({ name: h.name, sector: h.sector, pct: h.pct });
    } else {
      const oldH = oldMap.get(key)!;
      const diff = h.pct - oldH.pct;
      if (diff > WEIGHT_CHANGE_THRESHOLD) {
        increased.push({ name: h.name, sector: h.sector, oldPct: oldH.pct, newPct: h.pct });
      } else if (diff < -WEIGHT_CHANGE_THRESHOLD) {
        decreased.push({ name: h.name, sector: h.sector, oldPct: oldH.pct, newPct: h.pct });
      }
    }
  }

  for (const [key, h] of oldMap) {
    if (!newMap.has(key)) removals.push({ name: h.name, sector: h.sector, pct: h.pct });
  }

  if (!additions.length && !removals.length && !increased.length && !decreased.length) return null;

  return {
    fundName: fund.name,
    category: fundCat,
    additions: additions.sort((a, b) => b.pct - a.pct),
    removals: removals.sort((a, b) => b.pct - a.pct),
    increased: increased.sort((a, b) => b.newPct - b.oldPct - (a.newPct - a.oldPct)),
    decreased: decreased.sort((a, b) => a.newPct - a.oldPct - (b.newPct - b.oldPct)),
  };
}

export function compareAmcHoldings(
  holdings: Record<string, FundHoldings>,
  opts: {
    month1: string;
    month2: string;
    selectedFund: string;
    selectedCategory: string;
  },
): FundComparison[] | null {
  const { month1, month2, selectedFund, selectedCategory } = opts;
  if (!month1 || !month2 || month1 === month2) return null;

  const results: FundComparison[] = [];
  for (const fund of Object.values(holdings)) {
    const row = compareSingleFund(fund, month1, month2, selectedFund, selectedCategory);
    if (row) results.push(row);
  }

  return sortFundComparisons(results);
}

function totalChanges(fund: FundComparison): number {
  return fund.additions.length + fund.removals.length + fund.increased.length + fund.decreased.length;
}

function sortFundComparisons(results: FundComparison[]): FundComparison[] {
  return results.sort((a, b) => totalChanges(b) - totalChanges(a));
}

/** Yields to the main thread periodically so mobile browsers stay responsive. */
export async function compareAmcHoldingsAsync(
  holdings: Record<string, FundHoldings>,
  opts: {
    month1: string;
    month2: string;
    selectedFund: string;
    selectedCategory: string;
  },
  isCancelled?: () => boolean,
): Promise<FundComparison[] | null> {
  const { month1, month2, selectedFund, selectedCategory } = opts;
  if (!month1 || !month2 || month1 === month2) return null;

  if (selectedFund !== 'All') {
    await yieldToMain();
    if (isCancelled?.()) return null;
    const fund = Object.values(holdings).find((f) => f.name === selectedFund);
    if (!fund) return [];
    const row = compareSingleFund(fund, month1, month2, selectedFund, selectedCategory);
    return row ? [row] : [];
  }

  const results: FundComparison[] = [];
  const funds = Object.values(holdings);
  let processed = 0;

  for (const fund of funds) {
    if (isCancelled?.()) return null;
    const row = compareSingleFund(fund, month1, month2, selectedFund, selectedCategory);
    if (row) results.push(row);
    processed += 1;
    if (processed % YIELD_EVERY_N_FUNDS === 0) await yieldToMain();
  }

  if (isCancelled?.()) return null;
  return sortFundComparisons(results);
}
