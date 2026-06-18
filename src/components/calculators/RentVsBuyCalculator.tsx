import { useState, useMemo } from 'react';

export default function RentVsBuyCalculator() {
  const [propertyPrice, setPropertyPrice] = useState(5000000);
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [loanRate, setLoanRate] = useState(8.5);
  const [loanTenure, setLoanTenure] = useState(20);
  const [monthlyRent, setMonthlyRent] = useState(15000);
  const [rentIncrease, setRentIncrease] = useState(5);
  const [propertyAppreciation, setPropertyAppreciation] = useState(5);
  const [investmentReturn, setInvestmentReturn] = useState(12);
  const [analysisPeriod, setAnalysisPeriod] = useState(20);

  const result = useMemo(() => {
    const downPayment = propertyPrice * (downPaymentPercent / 100);
    const loanAmount = propertyPrice - downPayment;
    const monthlyLoanRate = loanRate / 12 / 100;
    const totalMonths = loanTenure * 12;

    // EMI calculation
    const emi = loanAmount * monthlyLoanRate * Math.pow(1 + monthlyLoanRate, totalMonths) /
      (Math.pow(1 + monthlyLoanRate, totalMonths) - 1);

    // Buying scenario
    const totalEMIPaid = emi * Math.min(totalMonths, analysisPeriod * 12);
    const registrationCost = propertyPrice * 0.07; // ~7% stamp duty + registration
    const maintenanceCost = propertyPrice * 0.01 * analysisPeriod; // 1% per year
    const totalBuyingCost = downPayment + registrationCost + totalEMIPaid + maintenanceCost;
    const propertyValueAtEnd = propertyPrice * Math.pow(1 + propertyAppreciation / 100, analysisPeriod);

    // Outstanding loan at end of analysis period
    let outstanding = loanAmount;
    for (let m = 0; m < Math.min(totalMonths, analysisPeriod * 12); m++) {
      const interest = outstanding * monthlyLoanRate;
      const principal = emi - interest;
      outstanding -= principal;
    }
    outstanding = Math.max(0, outstanding);

    const netBuyingWealth = propertyValueAtEnd - outstanding;
    const totalBuyingOutflow = totalBuyingCost;

    // Renting scenario — invest the difference
    const monthlyInvestRate = investmentReturn / 12 / 100;
    let investmentCorpus = 0;
    let totalRentPaid = 0;
    let currentRent = monthlyRent;

    // Invest the down payment + registration upfront
    investmentCorpus = (downPayment + registrationCost) * Math.pow(1 + investmentReturn / 100, analysisPeriod);

    for (let year = 0; year < analysisPeriod; year++) {
      for (let month = 0; month < 12; month++) {
        totalRentPaid += currentRent;
        const monthIndex = year * 12 + month;
        // Monthly savings = EMI + maintenance - rent
        const monthlySaving = emi + (propertyPrice * 0.01 / 12) - currentRent;
        if (monthlySaving > 0) {
          const remainingMonths = analysisPeriod * 12 - monthIndex - 1;
          investmentCorpus += monthlySaving * Math.pow(1 + monthlyInvestRate, remainingMonths);
        }
      }
      currentRent = currentRent * (1 + rentIncrease / 100);
    }

    const netRentingWealth = investmentCorpus;
    const totalRentingOutflow = totalRentPaid;

    const buyingIsBetter = netBuyingWealth > netRentingWealth;
    const difference = Math.abs(netBuyingWealth - netRentingWealth);

    return {
      emi: Math.round(emi),
      downPayment: Math.round(downPayment),
      propertyValueAtEnd: Math.round(propertyValueAtEnd),
      netBuyingWealth: Math.round(netBuyingWealth),
      totalBuyingOutflow: Math.round(totalBuyingOutflow),
      netRentingWealth: Math.round(netRentingWealth),
      totalRentingOutflow: Math.round(totalRentingOutflow),
      totalRentPaid: Math.round(totalRentPaid),
      investmentCorpus: Math.round(investmentCorpus),
      buyingIsBetter,
      difference: Math.round(difference),
    };
  }, [propertyPrice, downPaymentPercent, loanRate, loanTenure, monthlyRent, rentIncrease, propertyAppreciation, investmentReturn, analysisPeriod]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-8">
      {/* Inputs */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Property Price</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(propertyPrice)}</span>
          </div>
          <input type="range" min="1000000" max="50000000" step="500000" value={propertyPrice}
            onChange={(e) => setPropertyPrice(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹10L</span><span>₹5Cr</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Down Payment</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{downPaymentPercent}% ({formatCurrency(propertyPrice * downPaymentPercent / 100)})</span>
          </div>
          <input type="range" min="10" max="50" step="5" value={downPaymentPercent}
            onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>10%</span><span>50%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Home Loan Interest Rate</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{loanRate}%</span>
          </div>
          <input type="range" min="6" max="14" step="0.1" value={loanRate}
            onChange={(e) => setLoanRate(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>6%</span><span>14%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Loan Tenure</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{loanTenure} years</span>
          </div>
          <input type="range" min="5" max="30" step="1" value={loanTenure}
            onChange={(e) => setLoanTenure(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>5 yrs</span><span>30 yrs</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Monthly Rent</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">₹{monthlyRent.toLocaleString('en-IN')}</span>
          </div>
          <input type="range" min="5000" max="200000" step="1000" value={monthlyRent}
            onChange={(e) => setMonthlyRent(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹5,000</span><span>₹2,00,000</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Annual Rent Increase</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{rentIncrease}%</span>
          </div>
          <input type="range" min="0" max="15" step="1" value={rentIncrease}
            onChange={(e) => setRentIncrease(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>0%</span><span>15%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Property Appreciation</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{propertyAppreciation}% p.a.</span>
          </div>
          <input type="range" min="0" max="15" step="0.5" value={propertyAppreciation}
            onChange={(e) => setPropertyAppreciation(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>0%</span><span>15%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Investment Return (if renting)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{investmentReturn}% p.a.</span>
          </div>
          <input type="range" min="6" max="20" step="0.5" value={investmentReturn}
            onChange={(e) => setInvestmentReturn(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>6%</span><span>20%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Analysis Period</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{analysisPeriod} years</span>
          </div>
          <input type="range" min="5" max="30" step="1" value={analysisPeriod}
            onChange={(e) => setAnalysisPeriod(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>5 yrs</span><span>30 yrs</span></div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4">
        {/* Verdict */}
        <div className={`text-center p-4 rounded-lg ${result.buyingIsBetter ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
          <p className="text-sm text-surface-600 dark:text-surface-400">Over {analysisPeriod} years, financially</p>
          <p className={`text-xl font-extrabold mt-1 ${result.buyingIsBetter ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
            {result.buyingIsBetter ? '🏠 Buying is Better' : '🏘️ Renting + Investing is Better'}
          </p>
          <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">
            by {formatCurrency(result.difference)}
          </p>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400">🏠 Buying</h4>
            <div>
              <p className="text-xs text-surface-500">Monthly EMI</p>
              <p className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(result.emi)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">Property Value ({analysisPeriod}yr)</p>
              <p className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(result.propertyValueAtEnd)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">Net Wealth (Buying)</p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(result.netBuyingWealth)}</p>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-green-600 dark:text-green-400">🏘️ Renting + Investing</h4>
            <div>
              <p className="text-xs text-surface-500">Total Rent Paid</p>
              <p className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(result.totalRentPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">Investment Corpus</p>
              <p className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(result.investmentCorpus)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">Net Wealth (Renting)</p>
              <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(result.netRentingWealth)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
