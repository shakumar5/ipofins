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
    if (/^(Industry|Market|Rating|Quantity|Value|ISIN|%)/i.test(fund.name)) continue;
    if (/Fair Value|Rs\.?\s*in\s*Lacs/i.test(fund.name)) continue;

    const fundCat = getFundCategory(fund.name);
    if (selectedCategory !== 'All' && fundCat !== selectedCategory) continue;
    if (selectedFund !== 'All' && fund.name !== selectedFund) continue;

    const oldHoldings = ((fund[month1] as Holding[] | undefined) || []).filter((h) => !isDebtHolding(h));
    const newHoldings = ((fund[month2] as Holding[] | undefined) || []).filter((h) => !isDebtHolding(h));
    if (oldHoldings.length === 0 || newHoldings.length === 0) continue;

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
        if (diff > 0.3) increased.push({ name: h.name, sector: h.sector, oldPct: oldH.pct, newPct: h.pct });
        else if (diff < -0.3) decreased.push({ name: h.name, sector: h.sector, oldPct: oldH.pct, newPct: h.pct });
      }
    }

    for (const [key, h] of oldMap) {
      if (!newMap.has(key)) removals.push({ name: h.name, sector: h.sector, pct: h.pct });
    }

    if (additions.length || removals.length || increased.length || decreased.length) {
      results.push({
        fundName: fund.name,
        category: fundCat,
        additions: additions.sort((a, b) => b.pct - a.pct),
        removals: removals.sort((a, b) => b.pct - a.pct),
        increased: increased.sort((a, b) => b.newPct - b.oldPct - (a.newPct - a.oldPct)),
        decreased: decreased.sort((a, b) => a.newPct - a.oldPct - (b.newPct - b.oldPct)),
      });
    }
  }

  return results.sort(
    (a, b) => b.additions.length + b.removals.length - (a.additions.length + a.removals.length),
  );
}
