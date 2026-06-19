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
