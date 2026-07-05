import { useState, useMemo } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';
import { useFieldErrors } from './useFieldErrors';

type AssetType = 'equity_mf' | 'debt_mf' | 'stocks' | 'gold';

const ASSET_CONFIG: Record<
  AssetType,
  { name: string; ltThreshold: number; stcgRate: number; ltcgRate: number; ltcgExemption: number }
> = {
  equity_mf: { name: 'Equity Mutual Funds', ltThreshold: 12, stcgRate: 20, ltcgRate: 12.5, ltcgExemption: 125_000 },
  stocks: { name: 'Listed Stocks', ltThreshold: 12, stcgRate: 20, ltcgRate: 12.5, ltcgExemption: 125_000 },
  debt_mf: { name: 'Debt Mutual Funds', ltThreshold: 0, stcgRate: 0, ltcgRate: 0, ltcgExemption: 0 },
  gold: { name: 'Gold / Gold ETF', ltThreshold: 24, stcgRate: 0, ltcgRate: 12.5, ltcgExemption: 125_000 },
};

function TaxCalculatorInner() {
  const [assetType, setAssetType] = useState<AssetType>('equity_mf');
  const [purchaseAmount, setPurchaseAmount] = useState(200_000);
  const [saleAmount, setSaleAmount] = useState(300_000);
  const [holdingMonths, setHoldingMonths] = useState(14);
  const [taxSlab, setTaxSlab] = useState(30);
  const { errors, setError } = useFieldErrors();

  const result = useMemo(() => {
    const config = ASSET_CONFIG[assetType];
    const capitalGain = saleAmount - purchaseAmount;
    if (capitalGain <= 0) {
      return { capitalGain, taxType: 'No Gain', taxRate: 0, taxableGain: 0, taxAmount: 0, netProfit: capitalGain, effectiveRate: 0 };
    }

    const isLongTerm = holdingMonths >= config.ltThreshold && config.ltThreshold > 0;
    let taxRate: number;
    let taxableGain: number;
    let taxType: string;

    if (assetType === 'debt_mf') {
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
      if (assetType === 'gold' && !isLongTerm) {
        taxRate = taxSlab;
        taxType = 'STCG (Slab Rate)';
      }
    }

    const taxAmount = Math.round((taxableGain * taxRate) / 100);
    const netProfit = capitalGain - taxAmount;
    const effectiveRate = capitalGain > 0 ? (taxAmount / capitalGain) * 100 : 0;

    return { capitalGain, taxType, taxRate, taxableGain, taxAmount, netProfit, effectiveRate };
  }, [assetType, purchaseAmount, saleAmount, holdingMonths, taxSlab]);

  return (
    <div className="space-y-8">
      <div>
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-3">Asset Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(ASSET_CONFIG) as [AssetType, (typeof ASSET_CONFIG)[AssetType]][]).map(([key, val]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAssetType(key)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                assetType === key
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600'
              }`}
            >
              {val.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <SliderField id="tax-purchase" label="Purchase Amount" value={purchaseAmount}
          min={10_000} max={10_000_000} step={10_000} display={formatCalculatorCurrency(purchaseAmount)}
          minLabel="₹10K" maxLabel="₹1Cr"
          validation={{ type: 'amount', label: 'Purchase amount', min: 10_000, max: 10_000_000 }}
          error={errors.purchase} onValidChange={setPurchaseAmount} onError={setError('purchase')} />
        <SliderField id="tax-sale" label="Sale Amount" value={saleAmount}
          min={10_000} max={10_000_000} step={10_000} display={formatCalculatorCurrency(saleAmount)}
          minLabel="₹10K" maxLabel="₹1Cr"
          validation={{ type: 'amount', label: 'Sale amount', min: 10_000, max: 10_000_000 }}
          error={errors.sale} onValidChange={setSaleAmount} onError={setError('sale')} />
        <SliderField id="tax-holding" label="Holding Period" value={holdingMonths}
          min={1} max={60} step={1} display={`${holdingMonths} months`}
          minLabel="1 month" maxLabel="60 months"
          validation={{ type: 'integer', label: 'Holding period (months)', min: 1, max: 60 }}
          error={errors.holding} onValidChange={setHoldingMonths} onError={setError('holding')} />
        {(assetType === 'debt_mf' || (assetType === 'gold' && holdingMonths < 24)) && (
          <SliderField id="tax-slab" label="Your Income Tax Slab" value={taxSlab}
            min={5} max={30} step={5} display={`${taxSlab}%`} minLabel="5%" maxLabel="30%"
            validation={{ type: 'rate', label: 'Tax slab', min: 5, max: 30 }}
            error={errors.slab} onValidChange={setTaxSlab} onError={setError('slab')} />
        )}
      </div>

      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
        <div className={`text-center p-4 rounded-lg ${result.capitalGain > 0 ? 'bg-warning-50 dark:bg-warning-900/20' : 'bg-success-50 dark:bg-success-900/20'}`}>
          <p className="text-xs text-surface-500">Tax Liability</p>
          <p className={`text-2xl font-extrabold font-mono mt-1 ${result.taxAmount > 0 ? 'text-warning-600' : 'text-success-600'}`}>
            {result.taxAmount > 0 ? formatCalculatorCurrency(result.taxAmount) : '₹0 (No Tax)'}
          </p>
          <p className="text-xs text-surface-500 mt-1">{result.taxType} @ {result.taxRate}%</p>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center">
            <p className="text-xs text-surface-500">Capital Gain</p>
            <p className="text-sm font-bold font-mono mt-1">{formatCalculatorCurrency(result.capitalGain)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500">Taxable Gain</p>
            <p className="text-sm font-bold font-mono mt-1">{formatCalculatorCurrency(result.taxableGain)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500">Net Profit (After Tax)</p>
            <p className="text-sm font-bold font-mono text-success-500 mt-1">{formatCalculatorCurrency(result.netProfit)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500">Effective Tax Rate</p>
            <p className="text-sm font-bold font-mono mt-1">{result.effectiveRate.toFixed(1)}%</p>
          </div>
        </div>
        <CalculatorShareRow
          tool="Tax Calculator"
          summary={`${result.taxType} tax ${formatCalculatorCurrency(result.taxAmount)} on ${formatCalculatorCurrency(result.capitalGain)} gain`}
          shareText={`Capital gains tax: ${result.taxType} @ ${result.taxRate}% → ${formatCalculatorCurrency(result.taxAmount)} tax, net profit ${formatCalculatorCurrency(result.netProfit)}.`}
        />
      </div>
    </div>
  );
}

export default withErrorBoundary(TaxCalculatorInner, 'Tax Calculator');
