import { useState, useMemo } from 'react';

export default function IPOProfitCalculator() {
  const [ipoPrice, setIpoPrice] = useState(500);
  const [listingPrice, setListingPrice] = useState(650);
  const [lotSize, setLotSize] = useState(30);
  const [lotsApplied, setLotsApplied] = useState(1);

  const result = useMemo(() => {
    const totalShares = lotSize * lotsApplied;
    const investmentAmount = ipoPrice * totalShares;
    const listingValue = listingPrice * totalShares;
    const profit = listingValue - investmentAmount;
    const returnPercentage = ((listingPrice - ipoPrice) / ipoPrice) * 100;
    return { totalShares, investmentAmount, listingValue, profit, returnPercentage };
  }, [ipoPrice, listingPrice, lotSize, lotsApplied]);

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">IPO Price (₹)</label>
            <input
              type="number" min="10" max="10000" value={ipoPrice}
              onChange={(e) => setIpoPrice(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Expected Listing (₹)</label>
            <input
              type="number" min="10" max="50000" value={listingPrice}
              onChange={(e) => setListingPrice(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Lot Size</label>
            <input
              type="number" min="1" max="5000" value={lotSize}
              onChange={(e) => setLotSize(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Lots Applied</label>
            <input
              type="number" min="1" max="20" value={lotsApplied}
              onChange={(e) => setLotsApplied(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className={`rounded-xl p-6 ${result.profit >= 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'}`}>
        <div className="text-center mb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            {result.profit >= 0 ? 'Estimated Profit' : 'Estimated Loss'}
          </p>
          <p className={`text-4xl font-extrabold ${result.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {result.profit >= 0 ? '+' : ''}{formatCurrency(result.profit)}
          </p>
          <p className={`text-sm font-semibold mt-1 ${result.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {result.returnPercentage >= 0 ? '+' : ''}{result.returnPercentage.toFixed(1)}% return
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Investment</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(result.investmentAmount)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Listing Value</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(result.listingValue)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Shares</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{result.totalShares}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
