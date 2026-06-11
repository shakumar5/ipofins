import { useState, useMemo } from 'react';

interface Holding {
  name: string;
  isin: string;
  sector: string;
  quantity: number;
  value: number;
  pct: number;
}

interface FundHoldings {
  name: string;
  amc: string;
  [month: string]: Holding[] | string;
}

interface HoldingsData {
  months: string[];
  amcs: Record<string, string[]>;
  holdings: Record<string, FundHoldings>;
}

interface Props {
  data: HoldingsData;
}

export default function HoldingsCompare({ data }: Props) {
  const [selectedAMC, setSelectedAMC] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [month1, setMonth1] = useState(data.months[0] || '');
  const [month2, setMonth2] = useState(data.months[1] || data.months[0] || '');

  const amcList = useMemo(() => Object.keys(data.amcs).sort(), [data.amcs]);

  const FUND_CATEGORIES = ['All', 'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap', 'Others'];

  // Helper: check if a holding is a debt/money-market instrument (not equity)
  function isDebtHolding(h: Holding): boolean {
    // Sector contains credit rating (CRISIL AAA, ICRA AA+, FITCH A1+, CARE AAA, etc.)
    if (h.sector && /^(CRISIL|ICRA|FITCH|CARE|IND|BWR)\s/i.test(h.sector)) return true;
    // Name starts with coupon rate like "7.35% ..."
    if (/^\d+\.?\d*%\s/.test(h.name)) return true;
    // Name has maturity date like "(15/10/2027)"
    if (/\(\d{2}\/\d{2}\/\d{4}\)/.test(h.name)) return true;
    // Zero coupon bonds
    if (/\(ZCB\)/i.test(h.name)) return true;
    // Securitised instruments
    if (/securitisation trust/i.test(h.name)) return true;
    return false;
  }

  // Funds for selected AMC
  const fundsForAMC = useMemo(() => {
    if (!selectedAMC) return [];
    return (data.amcs[selectedAMC] || []).sort();
  }, [selectedAMC, data.amcs]);

  // Compare holdings for all funds of selected AMC between month1 and month2
  const comparison = useMemo(() => {
    if (!selectedAMC || !month1 || !month2 || month1 === month2) return null;

    // Categorize fund by name
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

    const results: {
      fundName: string;
      category: string;
      additions: { name: string; sector: string; pct: number }[];
      removals: { name: string; sector: string; pct: number }[];
      increased: { name: string; sector: string; oldPct: number; newPct: number }[];
      decreased: { name: string; sector: string; oldPct: number; newPct: number }[];
    }[] = [];

    for (const [slug, fund] of Object.entries(data.holdings)) {
      if (fund.amc !== selectedAMC) continue;

      const fundCat = getFundCategory(fund.name);
      if (selectedCategory !== 'All' && fundCat !== selectedCategory) continue;

      const oldHoldings = ((fund[month1] as Holding[] | undefined) || []).filter(h => !isDebtHolding(h));
      const newHoldings = ((fund[month2] as Holding[] | undefined) || []).filter(h => !isDebtHolding(h));

      if (oldHoldings.length === 0 || newHoldings.length === 0) continue;

      const oldMap = new Map(oldHoldings.map(h => [h.isin || h.name, h]));
      const newMap = new Map(newHoldings.map(h => [h.isin || h.name, h]));

      const additions: { name: string; sector: string; pct: number }[] = [];
      const removals: { name: string; sector: string; pct: number }[] = [];
      const increased: { name: string; sector: string; oldPct: number; newPct: number }[] = [];
      const decreased: { name: string; sector: string; oldPct: number; newPct: number }[] = [];

      // New additions (in month2 but not in month1)
      for (const [key, h] of newMap) {
        if (!oldMap.has(key)) {
          additions.push({ name: h.name, sector: h.sector, pct: h.pct });
        } else {
          const oldH = oldMap.get(key)!;
          const diff = h.pct - oldH.pct;
          if (diff > 0.3) {
            increased.push({ name: h.name, sector: h.sector, oldPct: oldH.pct, newPct: h.pct });
          } else if (diff < -0.3) {
            decreased.push({ name: h.name, sector: h.sector, oldPct: oldH.pct, newPct: h.pct });
          }
        }
      }

      // Removals (in month1 but not in month2)
      for (const [key, h] of oldMap) {
        if (!newMap.has(key)) {
          removals.push({ name: h.name, sector: h.sector, pct: h.pct });
        }
      }

      if (additions.length > 0 || removals.length > 0 || increased.length > 0 || decreased.length > 0) {
        results.push({
          fundName: fund.name,
          category: fundCat,
          additions: additions.sort((a, b) => b.pct - a.pct),
          removals: removals.sort((a, b) => b.pct - a.pct),
          increased: increased.sort((a, b) => (b.newPct - b.oldPct) - (a.newPct - a.oldPct)),
          decreased: decreased.sort((a, b) => (a.newPct - a.oldPct) - (b.newPct - b.oldPct)),
        });
      }
    }

    return results.sort((a, b) => (b.additions.length + b.removals.length) - (a.additions.length + a.removals.length));
  }, [selectedAMC, selectedCategory, month1, month2, data.holdings]);

  return (
    <div>
      {/* Filters */}
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Compare Holdings</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* AMC */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Select AMC</label>
            <select
              value={selectedAMC}
              onChange={(e) => setSelectedAMC(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              <option value="">-- Select AMC --</option>
              {amcList.map(amc => (
                <option key={amc} value={amc}>{amc} ({data.amcs[amc]?.length || 0} funds)</option>
              ))}
            </select>
          </div>

          {/* Fund Category */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Fund Type</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {FUND_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Month 1 (older) */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">From (older month)</label>
            <select
              value={month1}
              onChange={(e) => setMonth1(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.months.slice(0, -1).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Month 2 (newer) */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">To (newer month)</label>
            <select
              value={month2}
              onChange={(e) => setMonth2(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedAMC && (
          <p className="mt-3 text-xs text-surface-500 dark:text-surface-400">
            Showing changes for <strong>{fundsForAMC.length}</strong> equity funds from {selectedAMC} between {month1} → {month2}
          </p>
        )}
      </div>

      {/* No AMC selected */}
      {!selectedAMC && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Select an AMC above to view holdings changes</p>
          <p className="text-xs mt-1 text-surface-400 dark:text-surface-500">Data sourced from AMC monthly portfolio disclosures</p>
        </div>
      )}

      {/* Same month selected */}
      {selectedAMC && month1 === month2 && (
        <div className="text-center py-8 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <p className="text-sm font-medium">Please select two different months to compare</p>
        </div>
      )}

      {/* Results */}
      {comparison && comparison.length === 0 && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
          <div className="w-12 h-12 mx-auto bg-surface-100 dark:bg-surface-700 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-surface-400 dark:text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-sm font-medium">No portfolio changes detected</p>
          <p className="text-xs mt-1 text-surface-400 dark:text-surface-500">
            {selectedCategory !== 'All' 
              ? `No changes found for "${selectedCategory}" funds in this AMC between ${month1} → ${month2}. Try selecting "All" fund types.`
              : `This AMC's funds had no significant additions or removals between ${month1} → ${month2}. This is common for index funds that track a fixed benchmark.`
            }
          </p>
          <p className="text-xs mt-3 text-surface-400 dark:text-surface-500">If data is missing for one month, changes cannot be calculated. Holdings data is updated monthly.</p>
        </div>
      )}

      {comparison && comparison.length > 0 && (
        <div className="space-y-6">
          {comparison.map((fund, idx) => (
            <div key={idx} className="border border-surface-200 dark:border-surface-600 rounded-xl overflow-hidden">
              {/* Fund header */}
              <div className="px-4 py-3 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-600">
                <h3 className="font-semibold text-surface-900 dark:text-white text-sm">{fund.fundName}</h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                  {fund.additions.length} additions • {fund.removals.length} removals • {fund.increased.length} increased • {fund.decreased.length} decreased
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-600">
                {/* Additions */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">New Additions</span>
                  </div>
                  {fund.additions.length === 0 ? (
                    <p className="text-xs text-surface-400 dark:text-surface-500 italic">No new stocks added</p>
                  ) : (
                    <div className="space-y-2">
                      {fund.additions.map((h, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                          <div className="min-w-0">
                            <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                            {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                          </div>
                          <span className="text-green-600 dark:text-green-400 font-semibold whitespace-nowrap">
                            <span className="text-surface-400 dark:text-surface-500 font-normal">0%</span> → +{h.pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Removals */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Removed</span>
                  </div>
                  {fund.removals.length === 0 ? (
                    <p className="text-xs text-surface-400 dark:text-surface-500 italic">No stocks removed</p>
                  ) : (
                    <div className="space-y-2">
                      {fund.removals.map((h, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                          <div className="min-w-0">
                            <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                            {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                          </div>
                          <span className="text-red-500 dark:text-red-400 font-semibold whitespace-nowrap">
                            <span className="text-surface-400 dark:text-surface-500 font-normal">{h.pct}%</span> → 0%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Increased / Decreased */}
              {(fund.increased.length > 0 || fund.decreased.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-600 border-t border-surface-200 dark:border-surface-600">
                  {/* Increased */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Increased</span>
                    </div>
                    {fund.increased.length === 0 ? (
                      <p className="text-xs text-surface-400 dark:text-surface-500 italic">No holdings increased</p>
                    ) : (
                      <div className="space-y-2">
                        {fund.increased.map((h, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                            <div className="min-w-0">
                              <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                              {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                            </div>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                              <span className="text-surface-400 dark:text-surface-500 font-normal">{h.oldPct}%</span> → {h.newPct}% <span className="text-emerald-500">(+{(h.newPct - h.oldPct).toFixed(2)}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Decreased */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase">Decreased</span>
                    </div>
                    {fund.decreased.length === 0 ? (
                      <p className="text-xs text-surface-400 dark:text-surface-500 italic">No holdings decreased</p>
                    ) : (
                      <div className="space-y-2">
                        {fund.decreased.map((h, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                            <div className="min-w-0">
                              <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                              {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                            </div>
                            <span className="text-orange-600 dark:text-orange-400 font-semibold whitespace-nowrap">
                              <span className="text-surface-400 dark:text-surface-500 font-normal">{h.oldPct}%</span> → {h.newPct}% <span className="text-orange-500">({(h.newPct - h.oldPct).toFixed(2)}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
