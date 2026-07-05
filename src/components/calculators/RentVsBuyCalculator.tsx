import { useState, useMemo } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';
import { useFieldErrors } from './useFieldErrors';

function RentVsBuyCalculatorInner() {
  const [propertyPrice, setPropertyPrice] = useState(5_000_000);
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [loanRate, setLoanRate] = useState(8.5);
  const [loanTenure, setLoanTenure] = useState(20);
  const [monthlyRent, setMonthlyRent] = useState(15_000);
  const [rentIncrease, setRentIncrease] = useState(5);
  const [propertyAppreciation, setPropertyAppreciation] = useState(5);
  const [investmentReturn, setInvestmentReturn] = useState(12);
  const [analysisPeriod, setAnalysisPeriod] = useState(20);
  const { errors, setError } = useFieldErrors();

  const result = useMemo(() => {
    if (
      !Number.isFinite(propertyPrice) ||
      propertyPrice <= 0 ||
      downPaymentPercent <= 0 ||
      downPaymentPercent >= 100 ||
      loanTenure <= 0 ||
      analysisPeriod <= 0
    ) {
      return null;
    }

    const downPayment = propertyPrice * (downPaymentPercent / 100);
    const loanAmount = propertyPrice - downPayment;
    const monthlyLoanRate = loanRate / 12 / 100;
    const totalMonths = loanTenure * 12;
    const monthsAnalyzed = analysisPeriod * 12;

    let emi: number;
    if (monthlyLoanRate === 0) {
      emi = loanAmount / totalMonths;
    } else {
      const factor = Math.pow(1 + monthlyLoanRate, totalMonths);
      if (!Number.isFinite(factor) || factor === 1) return null;
      emi = (loanAmount * monthlyLoanRate * factor) / (factor - 1);
    }
    if (!Number.isFinite(emi)) return null;

    const totalEMIPaid = emi * Math.min(totalMonths, monthsAnalyzed);
    const registrationCost = propertyPrice * 0.07;
    const maintenanceCost = propertyPrice * 0.01 * analysisPeriod;
    const totalBuyingCost = downPayment + registrationCost + totalEMIPaid + maintenanceCost;
    const propertyValueAtEnd = propertyPrice * Math.pow(1 + propertyAppreciation / 100, analysisPeriod);

    let outstanding = loanAmount;
    for (let m = 0; m < Math.min(totalMonths, monthsAnalyzed); m++) {
      const interest = outstanding * monthlyLoanRate;
      const principal = emi - interest;
      outstanding -= principal;
    }
    outstanding = Math.max(0, outstanding);

    const netBuyingWealth = propertyValueAtEnd - outstanding;

    const monthlyInvestRate = investmentReturn / 12 / 100;
    let investmentCorpus = (downPayment + registrationCost) * Math.pow(1 + investmentReturn / 100, analysisPeriod);
    let totalRentPaid = 0;
    let currentRent = monthlyRent;

    for (let year = 0; year < analysisPeriod; year++) {
      for (let month = 0; month < 12; month++) {
        totalRentPaid += currentRent;
        const monthIndex = year * 12 + month;
        const monthlySaving = emi + (propertyPrice * 0.01) / 12 - currentRent;
        if (monthlySaving > 0) {
          const remainingMonths = monthsAnalyzed - monthIndex - 1;
          investmentCorpus += monthlySaving * Math.pow(1 + monthlyInvestRate, remainingMonths);
        }
      }
      currentRent = currentRent * (1 + rentIncrease / 100);
    }

    const netRentingWealth = investmentCorpus;
    const buyingIsBetter = netBuyingWealth > netRentingWealth;
    const difference = Math.abs(netBuyingWealth - netRentingWealth);

    if (!Number.isFinite(netBuyingWealth) || !Number.isFinite(netRentingWealth)) return null;

    return {
      emi: Math.round(emi),
      downPayment: Math.round(downPayment),
      propertyValueAtEnd: Math.round(propertyValueAtEnd),
      netBuyingWealth: Math.round(netBuyingWealth),
      totalBuyingOutflow: Math.round(totalBuyingCost),
      netRentingWealth: Math.round(netRentingWealth),
      totalRentingOutflow: Math.round(totalRentPaid),
      totalRentPaid: Math.round(totalRentPaid),
      investmentCorpus: Math.round(investmentCorpus),
      buyingIsBetter,
      difference: Math.round(difference),
    };
  }, [
    propertyPrice,
    downPaymentPercent,
    loanRate,
    loanTenure,
    monthlyRent,
    rentIncrease,
    propertyAppreciation,
    investmentReturn,
    analysisPeriod,
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="rvb-price"
          label="Property Price"
          value={propertyPrice}
          min={1_000_000}
          max={50_000_000}
          step={500_000}
          display={formatCalculatorCurrency(propertyPrice)}
          minLabel="₹10L"
          maxLabel="₹5Cr"
          validation={{ type: 'amount', label: 'Property price', min: 1_000_000, max: 50_000_000 }}
          error={errors.propertyPrice}
          onValidChange={setPropertyPrice}
          onError={setError('propertyPrice')}
        />
        <SliderField
          id="rvb-down"
          label="Down Payment"
          value={downPaymentPercent}
          min={10}
          max={50}
          step={5}
          display={`${downPaymentPercent}% (${formatCalculatorCurrency((propertyPrice * downPaymentPercent) / 100)})`}
          minLabel="10%"
          maxLabel="50%"
          validation={{ type: 'rate', label: 'Down payment', min: 10, max: 50 }}
          error={errors.downPaymentPercent}
          onValidChange={setDownPaymentPercent}
          onError={setError('downPaymentPercent')}
        />
        <SliderField
          id="rvb-rate"
          label="Home Loan Interest Rate"
          value={loanRate}
          min={6}
          max={14}
          step={0.1}
          display={`${loanRate}%`}
          minLabel="6%"
          maxLabel="14%"
          validation={{ type: 'rate', label: 'Loan interest rate', min: 6, max: 14 }}
          error={errors.loanRate}
          onValidChange={setLoanRate}
          onError={setError('loanRate')}
        />
        <SliderField
          id="rvb-tenure"
          label="Loan Tenure"
          value={loanTenure}
          min={5}
          max={30}
          step={1}
          display={`${loanTenure} years`}
          minLabel="5 yrs"
          maxLabel="30 yrs"
          validation={{ type: 'years', min: 5, max: 30 }}
          error={errors.loanTenure}
          onValidChange={setLoanTenure}
          onError={setError('loanTenure')}
        />
        <SliderField
          id="rvb-rent"
          label="Monthly Rent"
          value={monthlyRent}
          min={5_000}
          max={200_000}
          step={1_000}
          display={formatCalculatorCurrency(monthlyRent)}
          minLabel="₹5,000"
          maxLabel="₹2,00,000"
          validation={{ type: 'amount', label: 'Monthly rent', min: 5_000, max: 200_000 }}
          error={errors.monthlyRent}
          onValidChange={setMonthlyRent}
          onError={setError('monthlyRent')}
        />
        <SliderField
          id="rvb-rent-increase"
          label="Annual Rent Increase"
          value={rentIncrease}
          min={0}
          max={15}
          step={1}
          display={`${rentIncrease}%`}
          minLabel="0%"
          maxLabel="15%"
          validation={{ type: 'rate', label: 'Rent increase', min: 0, max: 15 }}
          error={errors.rentIncrease}
          onValidChange={setRentIncrease}
          onError={setError('rentIncrease')}
        />
        <SliderField
          id="rvb-appreciation"
          label="Property Appreciation"
          value={propertyAppreciation}
          min={0}
          max={15}
          step={0.5}
          display={`${propertyAppreciation}% p.a.`}
          minLabel="0%"
          maxLabel="15%"
          validation={{ type: 'rate', label: 'Property appreciation', min: 0, max: 15 }}
          error={errors.propertyAppreciation}
          onValidChange={setPropertyAppreciation}
          onError={setError('propertyAppreciation')}
        />
        <SliderField
          id="rvb-invest-return"
          label="Investment Return (if renting)"
          value={investmentReturn}
          min={6}
          max={20}
          step={0.5}
          display={`${investmentReturn}% p.a.`}
          minLabel="6%"
          maxLabel="20%"
          validation={{ type: 'rate', label: 'Investment return', min: 6, max: 20 }}
          error={errors.investmentReturn}
          onValidChange={setInvestmentReturn}
          onError={setError('investmentReturn')}
        />
        <SliderField
          id="rvb-period"
          label="Analysis Period"
          value={analysisPeriod}
          min={5}
          max={30}
          step={1}
          display={`${analysisPeriod} years`}
          minLabel="5 yrs"
          maxLabel="30 yrs"
          validation={{ type: 'years', min: 5, max: 30 }}
          error={errors.analysisPeriod}
          onValidChange={setAnalysisPeriod}
          onError={setError('analysisPeriod')}
        />
      </div>

      {result ? (
        <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
          <div
            className={`text-center p-4 rounded-lg ${
              result.buyingIsBetter ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-success-50 dark:bg-success-900/20'
            }`}
          >
            <p className="text-sm text-surface-600">Over {analysisPeriod} years, financially</p>
            <p
              className={`text-xl font-extrabold mt-1 ${
                result.buyingIsBetter ? 'text-primary-600' : 'text-success-600'
              }`}
            >
              {result.buyingIsBetter ? '🏠 Buying is Better' : '🏘️ Renting + Investing is Better'}
            </p>
            <p className="text-sm text-surface-600 mt-1">by {formatCalculatorCurrency(result.difference)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-primary-600">🏠 Buying</h4>
              <div>
                <p className="text-xs text-surface-500">Monthly EMI</p>
                <p className="text-sm font-bold font-mono">{formatCalculatorCurrency(result.emi)}</p>
              </div>
              <div>
                <p className="text-xs text-surface-500">Property Value ({analysisPeriod}yr)</p>
                <p className="text-sm font-bold font-mono">{formatCalculatorCurrency(result.propertyValueAtEnd)}</p>
              </div>
              <div>
                <p className="text-xs text-surface-500">Net Wealth (Buying)</p>
                <p className="text-sm font-bold font-mono text-primary-600">
                  {formatCalculatorCurrency(result.netBuyingWealth)}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-success-600">🏘️ Renting + Investing</h4>
              <div>
                <p className="text-xs text-surface-500">Total Rent Paid</p>
                <p className="text-sm font-bold font-mono">{formatCalculatorCurrency(result.totalRentPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-surface-500">Investment Corpus</p>
                <p className="text-sm font-bold font-mono">{formatCalculatorCurrency(result.investmentCorpus)}</p>
              </div>
              <div>
                <p className="text-xs text-surface-500">Net Wealth (Renting)</p>
                <p className="text-sm font-bold font-mono text-success-600">
                  {formatCalculatorCurrency(result.netRentingWealth)}
                </p>
              </div>
            </div>
          </div>
          <CalculatorShareRow
            tool="Rent vs Buy Calculator"
            summary={`${result.buyingIsBetter ? 'Buy' : 'Rent+Invest'} wins by ${formatCalculatorCurrency(result.difference)} over ${analysisPeriod}yr`}
            shareText={`Rent vs buy over ${analysisPeriod} years: ${result.buyingIsBetter ? 'buying' : 'renting + investing'} is better by ${formatCalculatorCurrency(result.difference)}.`}
          />
        </div>
      ) : (
        <p className="text-sm text-surface-500 text-center" role="status">
          Adjust inputs to see comparison results.
        </p>
      )}
    </div>
  );
}

export default withErrorBoundary(RentVsBuyCalculatorInner, 'Rent vs Buy Calculator');
