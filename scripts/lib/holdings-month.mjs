/** Normalize month payload from fund-holdings.json (array legacy or { stocks, totalStocks }). */

export function unpackMonthHoldings(monthData) {
  if (!monthData) return { stocks: [], totalStocks: 0 };
  if (Array.isArray(monthData)) {
    return { stocks: monthData, totalStocks: monthData.length };
  }
  const stocks = monthData.stocks || [];
  return {
    stocks,
    totalStocks: monthData.totalStocks ?? stocks.length,
  };
}

export function isMonthKey(key) {
  return key !== 'name' && key !== 'amc';
}

/** Latest month with holdings for one fund (falls back when global latest month is empty). */
export function latestMonthForFund(fund, months = []) {
  if (!fund || typeof fund !== 'object') return null;
  for (let i = months.length - 1; i >= 0; i--) {
    const m = months[i];
    const { totalStocks } = unpackMonthHoldings(fund[m]);
    if (totalStocks > 0) return m;
  }
  for (const key of Object.keys(fund)) {
    if (!isMonthKey(key)) continue;
    const { totalStocks } = unpackMonthHoldings(fund[key]);
    if (totalStocks > 0) return key;
  }
  return null;
}
