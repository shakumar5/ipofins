import { useState, useMemo } from 'react';

type AssetType = 'equity_mf' | 'debt_mf' | 'stocks' | 'gold';

const ASSET_CONFIG: Record<AssetType, { name: string; ltThreshold: number; stcgRate: number; ltcgRate: number; ltcgExemption: number }> = {
  equity_mf: { name: 'Equity Mutual Funds', ltThreshold: 12, stcgRate: 20, ltcgRate: 12.5, ltcgExemption: 125000 },
  stocks: { name: 'Listed Stocks', ltThreshold: 12, stcgRate: 20, ltcgRate: 12.5, ltcgExemption: 125000 },
  debt_mf: { name: 'Debt Mutual Funds', ltThreshold: 0, stcgRate: 0, ltcgRate: 0, ltcgExemption: 0 },
  gold: { name: 'Gold / Gold ETF', ltThreshold: 24, stcgRate: 0, ltcgRate: 12.5, ltcgExemption: 125000 },
};

export default function TaxCalculator() {
  const [assetType, setAssetType] = useState<AssetType>('equity_mf');
  const [purchaseAmount, setPurchaseAmount] = useState(200000);
  const [saleAmount, setSaleAmount] = useState(300000);
  const [holdingMonths, setHoldingMonths] = useState(14);
  const [taxSlab, setTaxSlab] = useState(30);

  const result = useMemo(() => {
    const config = ASSET_CONFIG[assetType];
    const capitalGain = saleAmount - purchaseAmount;
    if (capitalGain <= 0) return { capitalGain, taxType: 'No Gain', taxRate: 0, taxableGain: 0, taxAmount: 0, netProfit: capitalGain, effectiveRate: 0 };

    const isLongTerm = holdingMonths >= config.ltThreshold && config.ltThreshold > 0;

    let taxRate: number;
    let taxableGain: number;
    let taxType: string;

    if (assetType === 'debt_mf') {
      // Debt MF: always taxed at slab rate (post-2023 rules)
      taxType = 'Slab Rate (Debt MF)';
      taxRate = taxSlab;
      taxableGain = capitalGain;
    } else if (isLongTerm) {
      taxType = 'LTCG';
      taxRate = config.ltcgRate;
      taxableGain = Math.max(0, capitalGain - config.ltcgExemption);
    } else {
      taxType = 'STCG';
      taxRate = config.stcgRate;
      taxableGain = capitalGain;
      // For gold STCG, tax at slab rate
      if (assetType === 'gold' && !isLongTerm) {
        taxRate = taxSlab;
        taxType = 'STCG (Slab Rate)';
      }
    }

    const taxAmount = Math.round(taxableGain * taxRate / 100);
    const netProfit = capitalGain - taxAmount;
    const effectiveRate = capitalGain > 0 ? (taxAmount / capitalGain) * 100 : 0;

    return { capitalGain, taxType, taxRate, taxableGain, taxAmount, netProfit, effectiveRate };
  }, [assetType, purchaseAmount, saleAmount, holdingMonths, taxSlab]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-8">
      {/* Asset Type Selector */}
      <div>
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-3">Asset Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(ASSET_CONFIG) as [AssetType, typeof ASSET_CONFIG[AssetType]][]).map(([key, val]) => (
            <button key={key} onClick={() => setAssetType(key)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${assetType === key ? 'bg-blue-600 text-white' : 'bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600'}`}>
              {val.name}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Purchase Amount</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(purchaseAmount)}</span>
          </div>
          <input type="range" min="10000" max="10000000" step="10000" value={purchaseAmount}
            onChange={(e) => setPurchaseAmount(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹10K</span><span>₹1Cr</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Sale Amount</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(saleAmount)}</span>
          </div>
          <input type="range" min="10000" max="10000000" step="10000" value={saleAmount}
            onChange={(e) => setSaleAmount(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹10K</span><span>₹1Cr</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Holding Period</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{holdingMonths} months</span>
          </div>
          <input type="range" min="1" max="60" step="1" value={holdingMonths}
            onChange={(e) => setHoldingMonths(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>1 month</span><span>60 months</span></div>
        </div>

        {(assetType === 'debt_mf' || (assetType === 'gold' && holdingMonths < 24)) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Your Income Tax Slab</label>
              <span className="text-sm font-bold text-surface-900 dark:text-white">{taxSlab}%</span>
            </div>
            <input type="range" min="5" max="30" step="5" value={taxSlab}
              onChange={(e) => setTaxSlab(Number(e.target.value))}
              className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
            <div className="flex justify-between text-xs text-surface-500 mt-1"><span>5%</span><span>30%</span></div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4">
        <div className={`text-center p-4 rounded-lg ${result.capitalGain > 0 ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
          <p className="text-xs text-surface-500 dark:text-surface-400">Tax Liability</p>
          <p className={`text-2xl font-extrabold mt-1 ${result.taxAmount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
            {result.taxAmount > 0 ? formatCurrency(result.taxAmount) : '₹0 (No Tax)'}
          </p>
          <p className="text-xs text-surface-500 mt-1">{result.taxType} @ {result.taxRate}%</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Capital Gain</p>
            <p className="text-sm font-bold text-surface-900 dark:text-white mt-1">{formatCurrency(result.capitalGain)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Taxable Gain</p>
            <p className="text-sm font-bold text-surface-900 dark:text-white mt-1">{formatCurrency(result.taxableGain)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Net Profit (After Tax)</p>
            <p className="text-sm font-bold text-green-500 mt-1">{formatCurrency(result.netProfit)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Effective Tax Rate</p>
            <p className="text-sm font-bold text-surface-900 dark:text-white mt-1">{result.effectiveRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
