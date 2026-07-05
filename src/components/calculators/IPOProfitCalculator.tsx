import { useState, useMemo, useCallback } from 'react';
import {
  validateAmount,
  validateLotSize,
  validateInteger,
  formatCalculatorCurrency,
} from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

function IPOProfitCalculatorInner() {
  const [ipoPrice, setIpoPrice] = useState(500);
  const [listingPrice, setListingPrice] = useState(650);
  const [lotSize, setLotSize] = useState(30);
  const [lotsApplied, setLotsApplied] = useState(1);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const setError = useCallback(
    (field: string) => (msg?: string) => setErrors((e) => ({ ...e, [field]: msg })),
    [],
  );

  const handleIpoPrice = (raw: string) => {
    const v = validateAmount(raw, 'IPO price', 10, 10_000);
    setError('ipoPrice')(v.error);
    if (v.isValid) setIpoPrice(Number(raw));
  };

  const handleListingPrice = (raw: string) => {
    const v = validateAmount(raw, 'Listing price', 10, 50_000);
    setError('listingPrice')(v.error);
    if (v.isValid) setListingPrice(Number(raw));
  };

  const handleLotSize = (raw: string) => {
    const v = validateLotSize(raw);
    setError('lotSize')(v.error);
    if (v.isValid) setLotSize(parseInt(raw, 10));
  };

  const handleLotsApplied = (raw: string) => {
    const v = validateInteger(raw, 'Lots applied', 1, 20);
    setError('lotsApplied')(v.error);
    if (v.isValid) setLotsApplied(parseInt(raw, 10));
  };

  const result = useMemo(() => {
    if (ipoPrice <= 0 || lotSize <= 0 || lotsApplied <= 0) return null;
    const totalShares = lotSize * lotsApplied;
    const investmentAmount = ipoPrice * totalShares;
    const listingValue = listingPrice * totalShares;
    const profit = listingValue - investmentAmount;
    const returnPercentage = ((listingPrice - ipoPrice) / ipoPrice) * 100;
    if (!Number.isFinite(profit)) return null;
    return { totalShares, investmentAmount, listingValue, profit, returnPercentage };
  }, [ipoPrice, listingPrice, lotSize, lotsApplied]);

  const inputClass =
    'w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-800 text-surface-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ipo-price" className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">
              IPO Price (₹)
            </label>
            <input id="ipo-price" type="number" min={10} max={10000} value={ipoPrice}
              onChange={(e) => handleIpoPrice(e.target.value)} className={inputClass}
              aria-invalid={errors.ipoPrice ? true : undefined} />
            {errors.ipoPrice && <p className="text-xs text-danger-600 mt-1" role="alert">{errors.ipoPrice}</p>}
          </div>
          <div>
            <label htmlFor="listing-price" className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">
              Expected Listing (₹)
            </label>
            <input id="listing-price" type="number" min={10} max={50000} value={listingPrice}
              onChange={(e) => handleListingPrice(e.target.value)} className={inputClass}
              aria-invalid={errors.listingPrice ? true : undefined} />
            {errors.listingPrice && <p className="text-xs text-danger-600 mt-1" role="alert">{errors.listingPrice}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="lot-size" className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">
              Lot Size
            </label>
            <input id="lot-size" type="number" min={1} max={5000} value={lotSize}
              onChange={(e) => handleLotSize(e.target.value)} className={inputClass} />
            {errors.lotSize && <p className="text-xs text-danger-600 mt-1" role="alert">{errors.lotSize}</p>}
          </div>
          <div>
            <label htmlFor="lots-applied" className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">
              Lots Applied
            </label>
            <input id="lots-applied" type="number" min={1} max={20} value={lotsApplied}
              onChange={(e) => handleLotsApplied(e.target.value)} className={inputClass} />
            {errors.lotsApplied && <p className="text-xs text-danger-600 mt-1" role="alert">{errors.lotsApplied}</p>}
          </div>
        </div>
      </div>

      {result && (
        <div className={`rounded-xl p-6 ${result.profit >= 0 ? 'bg-success-50 dark:bg-success-900/10' : 'bg-danger-50 dark:bg-danger-900/10'}`} aria-live="polite">
          <div className="text-center mb-4">
            <p className="text-xs text-surface-500 mb-1">{result.profit >= 0 ? 'Estimated Profit' : 'Estimated Loss'}</p>
            <p className={`text-4xl font-extrabold font-mono ${result.profit >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
              {result.profit >= 0 ? '+' : ''}{formatCalculatorCurrency(result.profit)}
            </p>
            <p className={`text-sm font-semibold font-mono mt-1 ${result.profit >= 0 ? 'text-success-500' : 'text-danger-500'}`}>
              {result.returnPercentage >= 0 ? '+' : ''}{result.returnPercentage.toFixed(1)}% return
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <div className="text-center">
              <p className="text-xs text-surface-500">Investment</p>
              <p className="text-sm font-bold font-mono mt-1">{formatCalculatorCurrency(result.investmentAmount)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500">Listing Value</p>
              <p className="text-sm font-bold font-mono mt-1">{formatCalculatorCurrency(result.listingValue)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500">Total Shares</p>
              <p className="text-sm font-bold font-mono mt-1">{result.totalShares.toLocaleString('en-IN')}</p>
            </div>
          </div>
          <CalculatorShareRow
            tool="IPO Profit Calculator"
            summary={`${result.profit >= 0 ? 'Profit' : 'Loss'} ${formatCalculatorCurrency(Math.abs(result.profit))} (${result.returnPercentage.toFixed(1)}%)`}
            shareText={`IPO listing estimate: ${result.profit >= 0 ? '+' : ''}${formatCalculatorCurrency(result.profit)} (${result.returnPercentage.toFixed(1)}%) on ${formatCalculatorCurrency(result.investmentAmount)}.`}
          />
        </div>
      )}
    </div>
  );
}

export default withErrorBoundary(IPOProfitCalculatorInner, 'IPO Profit Calculator');
