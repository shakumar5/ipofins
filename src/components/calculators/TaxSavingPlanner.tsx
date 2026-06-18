import { useState, useMemo } from 'react';

export default function TaxSavingPlanner() {
  const [grossIncome, setGrossIncome] = useState(1200000);
  const [hra, setHra] = useState(240000);
  const [rentPaid, setRentPaid] = useState(180000);
  const [isMetro, setIsMetro] = useState(true);
  const [section80C, setSection80C] = useState(150000);
  const [nps80CCD, setNps80CCD] = useState(50000);
  const [healthSelf, setHealthSelf] = useState(25000);
  const [healthParents, setHealthParents] = useState(25000);
  const [parentsAreSenior, setParentsAreSenior] = useState(false);
  const [homeLoanInterest, setHomeLoanInterest] = useState(0);

  const result = useMemo(() => {
    // HRA exemption calculation (Old Regime)
    const basicSalary = grossIncome * 0.5; // Assume basic = 50% of gross
    const hraExempt = Math.min(
      hra,
      rentPaid - 0.1 * basicSalary,
      (isMetro ? 0.5 : 0.4) * basicSalary
    );
    const hraDeduction = Math.max(0, hraExempt);

    // 80C: max 1.5L
    const deduction80C = Math.min(section80C, 150000);
    // 80CCD(1B): max 50K for NPS
    const deduction80CCD = Math.min(nps80CCD, 50000);
    // 80D: health insurance
    const maxSelf = 25000;
    const maxParents = parentsAreSenior ? 50000 : 25000;
    const deduction80D = Math.min(healthSelf, maxSelf) + Math.min(healthParents, maxParents);
    // Section 24: home loan interest max 2L
    const deduction24 = Math.min(homeLoanInterest, 200000);

    const totalDeductions = hraDeduction + deduction80C + deduction80CCD + deduction80D + deduction24;
    const standardDeduction = 75000; // FY 2024-25 onwards

    // Taxable income (Old Regime)
    const taxableWithDeductions = Math.max(0, grossIncome - standardDeduction - totalDeductions);
    const taxableWithout = Math.max(0, grossIncome - standardDeduction);

    // Tax calculation (Old regime slabs FY2024-25)
    const calcTax = (income: number) => {
      let tax = 0;
      if (income > 1000000) tax += (income - 1000000) * 0.30;
      if (income > 500000) tax += Math.min(income - 500000, 500000) * 0.20;
      if (income > 250000) tax += Math.min(income - 250000, 250000) * 0.05;
      // Cess 4%
      tax = tax * 1.04;
      return Math.round(tax);
    };

    const taxWithout = calcTax(taxableWithout);
    const taxWith = calcTax(taxableWithDeductions);
    const taxSaved = taxWithout - taxWith;

    return {
      hraDeduction: Math.round(hraDeduction),
      deduction80C,
      deduction80CCD,
      deduction80D,
      deduction24,
      totalDeductions: Math.round(totalDeductions),
      taxableWithout,
      taxableWithDeductions: Math.round(taxableWithDeductions),
      taxWithout,
      taxWith,
      taxSaved,
    };
  }, [grossIncome, hra, rentPaid, isMetro, section80C, nps80CCD, healthSelf, healthParents, parentsAreSenior, homeLoanInterest]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Gross Annual Income</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(grossIncome)}</span>
          </div>
          <input type="range" min="300000" max="5000000" step="50000" value={grossIncome}
            onChange={(e) => setGrossIncome(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹3L</span><span>₹50L</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">HRA Received (Annual)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(hra)}</span>
          </div>
          <input type="range" min="0" max="600000" step="10000" value={hra}
            onChange={(e) => setHra(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹6L</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Annual Rent Paid</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(rentPaid)}</span>
          </div>
          <input type="range" min="0" max="600000" step="10000" value={rentPaid}
            onChange={(e) => setRentPaid(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹6L</span></div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Metro City?</label>
          <button onClick={() => setIsMetro(!isMetro)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${isMetro ? 'bg-blue-600 text-white' : 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300'}`}>
            {isMetro ? 'Yes (50% HRA)' : 'No (40% HRA)'}
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Section 80C (ELSS, PPF, EPF, LIC)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(section80C)}</span>
          </div>
          <input type="range" min="0" max="150000" step="10000" value={section80C}
            onChange={(e) => setSection80C(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹1.5L (max)</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">NPS (80CCD 1B) - Extra ₹50K</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(nps80CCD)}</span>
          </div>
          <input type="range" min="0" max="50000" step="5000" value={nps80CCD}
            onChange={(e) => setNps80CCD(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹50K (max)</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Health Insurance - Self (80D)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(healthSelf)}</span>
          </div>
          <input type="range" min="0" max="25000" step="5000" value={healthSelf}
            onChange={(e) => setHealthSelf(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹25K (max)</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Health Insurance - Parents (80D)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(healthParents)}</span>
          </div>
          <input type="range" min="0" max="50000" step="5000" value={healthParents}
            onChange={(e) => setHealthParents(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹50K</span></div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Parents Senior Citizen?</label>
          <button onClick={() => setParentsAreSenior(!parentsAreSenior)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${parentsAreSenior ? 'bg-blue-600 text-white' : 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300'}`}>
            {parentsAreSenior ? 'Yes (₹50K limit)' : 'No (₹25K limit)'}
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Home Loan Interest (Section 24)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(homeLoanInterest)}</span>
          </div>
          <input type="range" min="0" max="200000" step="10000" value={homeLoanInterest}
            onChange={(e) => setHomeLoanInterest(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹2L (max)</span></div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4">
        <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
          <p className="text-xs text-surface-500 dark:text-surface-400">Total Tax Saved (Old Regime)</p>
          <p className="text-2xl font-extrabold text-green-600 dark:text-green-400 mt-1">{formatCurrency(result.taxSaved)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Tax Without Deductions</p>
            <p className="text-sm font-bold text-red-500 mt-1">{formatCurrency(result.taxWithout)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Tax With Deductions</p>
            <p className="text-sm font-bold text-green-500 mt-1">{formatCurrency(result.taxWith)}</p>
          </div>
        </div>

        {/* Deductions Breakdown */}
        <div className="pt-4 border-t border-surface-200 dark:border-surface-700 space-y-2">
          <p className="text-xs font-semibold text-surface-700 dark:text-surface-300">Deductions Breakdown</p>
          <div className="space-y-1">
            {result.hraDeduction > 0 && <div className="flex justify-between text-xs"><span className="text-surface-600 dark:text-surface-400">HRA Exemption</span><span className="font-medium text-surface-900 dark:text-white">{formatCurrency(result.hraDeduction)}</span></div>}
            {result.deduction80C > 0 && <div className="flex justify-between text-xs"><span className="text-surface-600 dark:text-surface-400">Section 80C</span><span className="font-medium text-surface-900 dark:text-white">{formatCurrency(result.deduction80C)}</span></div>}
            {result.deduction80CCD > 0 && <div className="flex justify-between text-xs"><span className="text-surface-600 dark:text-surface-400">NPS 80CCD(1B)</span><span className="font-medium text-surface-900 dark:text-white">{formatCurrency(result.deduction80CCD)}</span></div>}
            {result.deduction80D > 0 && <div className="flex justify-between text-xs"><span className="text-surface-600 dark:text-surface-400">Section 80D</span><span className="font-medium text-surface-900 dark:text-white">{formatCurrency(result.deduction80D)}</span></div>}
            {result.deduction24 > 0 && <div className="flex justify-between text-xs"><span className="text-surface-600 dark:text-surface-400">Section 24 (Home Loan)</span><span className="font-medium text-surface-900 dark:text-white">{formatCurrency(result.deduction24)}</span></div>}
            <div className="flex justify-between text-xs font-bold pt-1 border-t border-surface-200 dark:border-surface-700"><span className="text-surface-700 dark:text-surface-300">Total Deductions</span><span className="text-blue-600 dark:text-blue-400">{formatCurrency(result.totalDeductions)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
