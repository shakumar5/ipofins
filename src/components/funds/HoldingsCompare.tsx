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
  const [month1, setMonth1] = useState(data.months[0] || '');
  const [month2, setMonth2] = useState(data.months[1] || '');

  const amcList = useMemo(() => Object.keys(data.amcs).sort(), [data.amcs]);

  // Funds for selected AMC
  const fundsForAMC = useMemo(() => {
    if (!selectedAMC) return [];
    return (data.amcs[selectedAMC] || []).sort();
  }, [selectedAMC, data.amcs]);

  // Compare holdings for all funds of selected AMC between month1 and month2
  const comparison = useMemo(() => {
    if (!selectedAMC || !month1 || !month2 || month1 === month2) return null;

    const results: {
      fundName: string;
      additions: { name: string; sector: string; pct: number }[];
      removals: { name: string; sector: string; pct: number }[];
      increased: { name: string; sector: string; oldPct: number; newPct: number }[];
      decreased: { name: string; sector: string; oldPct: number; newPct: number }[];
    }[] = [];

    for (const [slug, fund] of Object.entries(data.holdings)) {
      if (fund.amc !== selectedAMC) continue;

      const oldHoldings = (fund[month1] as Holding[] | undefined) || [];
      const newHoldings = (fund[month2] as Holding[] | undefined) || [];

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
          additions: additions.sort((a, b) => b.pct - a.pct),
          removals: removals.sort((a, b) => b.pct - a.pct),
          increased: increased.sort((a, b) => (b.newPct - b.oldPct) - (a.newPct - a.oldPct)),
          decreased: decreased.sort((a, b) => (a.newPct - a.oldPct) - (b.newPct - b.oldPct)),
        });
      }
    }

    return results.sort((a, b) => (b.additions.length + b.removals.length) - (a.additions.length + a.removals.length));
  }, [selectedAMC, month1, month2, data.holdings]);

  return (
    <div>
      {/* Filters */}
      <div className="p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl mb-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Compare Holdings</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* AMC */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">Select AMC</label>
            <select
              value={selectedAMC}
              onChange={(e) => setSelectedAMC(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              <option value="">-- Select AMC --</option>
              {amcList.map(amc => (
                <option key={amc} value={amc}>{amc} ({data.amcs[amc]?.length || 0} funds)</option>
              ))}
            </select>
          </div>

          {/* Month 1 (older) */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">From (older month)</label>
            <select
              value={month1}
              onChange={(e) => setMonth1(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              {data.months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Month 2 (newer) */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">To (newer month)</label>
            <select
              value={month2}
              onChange={(e) => setMonth2(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              {data.months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedAMC && (
          <p className="mt-3 text-xs text-gray-500">
            Showing changes for <strong>{fundsForAMC.length}</strong> equity funds from {selectedAMC} between {month1} → {month2}
          </p>
        )}
      </div>

      {/* No AMC selected */}
      {!selectedAMC && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">Select an AMC above to view holdings changes</p>
          <p className="text-xs mt-1 text-gray-400">Data sourced from AMC monthly portfolio disclosures</p>
        </div>
      )}

      {/* Same month selected */}
      {selectedAMC && month1 === month2 && (
        <div className="text-center py-8 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <p className="text-sm font-medium">Please select two different months to compare</p>
        </div>
      )}

      {/* Results */}
      {comparison && comparison.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <p className="text-sm font-medium">No holdings data available for this AMC in the selected months</p>
          <p className="text-xs mt-1 text-gray-400">Data will be added soon. Holdings are updated monthly.</p>
        </div>
      )}

      {comparison && comparison.length > 0 && (
        <div className="space-y-6">
          {comparison.map((fund, idx) => (
            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Fund header */}
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{fund.fundName}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fund.additions.length} additions • {fund.removals.length} removals • {fund.increased.length} increased • {fund.decreased.length} decreased
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-700">
                {/* Additions */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">New Additions</span>
                  </div>
                  {fund.additions.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No new stocks added</p>
                  ) : (
                    <div className="space-y-1.5">
                      {fund.additions.map((h, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-white">{h.name}</span>
                            {h.sector && <span className="ml-1 text-gray-400">• {h.sector}</span>}
                          </div>
                          <span className="text-green-600 font-semibold">+{h.pct}%</span>
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
                    <p className="text-xs text-gray-400 italic">No stocks removed</p>
                  ) : (
                    <div className="space-y-1.5">
                      {fund.removals.map((h, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-white">{h.name}</span>
                            {h.sector && <span className="ml-1 text-gray-400">• {h.sector}</span>}
                          </div>
                          <span className="text-red-500 font-semibold">-{h.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
