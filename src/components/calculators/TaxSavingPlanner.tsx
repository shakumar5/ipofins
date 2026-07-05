import { useState, useMemo } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';
import { useFieldErrors } from './useFieldErrors';

function TaxSavingPlannerInner() {
  const [grossIncome, setGrossIncome] = useState(1_200_000);
  const [hra, setHra] = useState(240_000);
  const [rentPaid, setRentPaid] = useState(180_000);
  const [isMetro, setIsMetro] = useState(true);
  const [section80C, setSection80C] = useState(150_000);
  const [nps80CCD, setNps80CCD] = useState(50_000);
  const [healthSelf, setHealthSelf] = useState(25_000);
  const [healthParents, setHealthParents] = useState(25_000);
  const [parentsAreSenior, setParentsAreSenior] = useState(false);
  const [homeLoanInterest, setHomeLoanInterest] = useState(0);
  const { errors, setError } = useFieldErrors();

  const result = useMemo(() => {
    const basicSalary = grossIncome * 0.5;
    const hraExempt = Math.min(hra, rentPaid - 0.1 * basicSalary, (isMetro ? 0.5 : 0.4) * basicSalary);
    const hraDeduction = Math.max(0, hraExempt);

    const deduction80C = Math.min(section80C, 150_000);
    const deduction80CCD = Math.min(nps80CCD, 50_000);
    const maxSelf = 25_000;
    const maxParents = parentsAreSenior ? 50_000 : 25_000;
    const deduction80D = Math.min(healthSelf, maxSelf) + Math.min(healthParents, maxParents);
    const deduction24 = Math.min(homeLoanInterest, 200_000);

    const totalDeductions = hraDeduction + deduction80C + deduction80CCD + deduction80D + deduction24;
    const standardDeduction = 75_000;

    const taxableWithDeductions = Math.max(0, grossIncome - standardDeduction - totalDeductions);
    const taxableWithout = Math.max(0, grossIncome - standardDeduction);

    const calcTax = (income: number) => {
      let tax = 0;
      if (income > 1_000_000) tax += (income - 1_000_000) * 0.3;
      if (income > 500_000) tax += Math.min(income - 500_000, 500_000) * 0.2;
      if (income > 250_000) tax += Math.min(income - 250_000, 250_000) * 0.05;
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
  }, [
    grossIncome,
    hra,
    rentPaid,
    isMetro,
    section80C,
    nps80CCD,
    healthSelf,
    healthParents,
    parentsAreSenior,
    homeLoanInterest,
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="tax-gross-income"
          label="Gross Annual Income"
          value={grossIncome}
          min={300_000}
          max={5_000_000}
          step={50_000}
          display={formatCalculatorCurrency(grossIncome)}
          minLabel="₹3L"
          maxLabel="₹50L"
          validation={{ type: 'amount', label: 'Gross income', min: 300_000, max: 5_000_000 }}
          error={errors.grossIncome}
          onValidChange={setGrossIncome}
          onError={setError('grossIncome')}
        />
        <SliderField
          id="tax-hra"
          label="HRA Received (Annual)"
          value={hra}
          min={0}
          max={600_000}
          step={10_000}
          display={formatCalculatorCurrency(hra)}
          minLabel="₹0"
          maxLabel="₹6L"
          validation={{ type: 'amount', label: 'HRA received', min: 0, max: 600_000 }}
          error={errors.hra}
          onValidChange={setHra}
          onError={setError('hra')}
        />
        <SliderField
          id="tax-rent"
          label="Annual Rent Paid"
          value={rentPaid}
          min={0}
          max={600_000}
          step={10_000}
          display={formatCalculatorCurrency(rentPaid)}
          minLabel="₹0"
          maxLabel="₹6L"
          validation={{ type: 'amount', label: 'Rent paid', min: 0, max: 600_000 }}
          error={errors.rentPaid}
          onValidChange={setRentPaid}
          onError={setError('rentPaid')}
        />

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Metro City?</span>
          <button
            type="button"
            onClick={() => setIsMetro(!isMetro)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${
              isMetro
                ? 'bg-primary-600 text-white'
                : 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300'
            }`}
          >
            {isMetro ? 'Yes (50% HRA)' : 'No (40% HRA)'}
          </button>
        </div>

        <SliderField
          id="tax-80c"
          label="Section 80C (ELSS, PPF, EPF, LIC)"
          value={section80C}
          min={0}
          max={150_000}
          step={10_000}
          display={formatCalculatorCurrency(section80C)}
          minLabel="₹0"
          maxLabel="₹1.5L (max)"
          validation={{ type: 'amount', label: 'Section 80C', min: 0, max: 150_000 }}
          error={errors.section80C}
          onValidChange={setSection80C}
          onError={setError('section80C')}
        />
        <SliderField
          id="tax-nps"
          label="NPS (80CCD 1B) - Extra ₹50K"
          value={nps80CCD}
          min={0}
          max={50_000}
          step={5_000}
          display={formatCalculatorCurrency(nps80CCD)}
          minLabel="₹0"
          maxLabel="₹50K (max)"
          validation={{ type: 'amount', label: 'NPS contribution', min: 0, max: 50_000 }}
          error={errors.nps80CCD}
          onValidChange={setNps80CCD}
          onError={setError('nps80CCD')}
        />
        <SliderField
          id="tax-health-self"
          label="Health Insurance - Self (80D)"
          value={healthSelf}
          min={0}
          max={25_000}
          step={5_000}
          display={formatCalculatorCurrency(healthSelf)}
          minLabel="₹0"
          maxLabel="₹25K (max)"
          validation={{ type: 'amount', label: 'Health insurance (self)', min: 0, max: 25_000 }}
          error={errors.healthSelf}
          onValidChange={setHealthSelf}
          onError={setError('healthSelf')}
        />
        <SliderField
          id="tax-health-parents"
          label="Health Insurance - Parents (80D)"
          value={healthParents}
          min={0}
          max={50_000}
          step={5_000}
          display={formatCalculatorCurrency(healthParents)}
          minLabel="₹0"
          maxLabel="₹50K"
          validation={{ type: 'amount', label: 'Health insurance (parents)', min: 0, max: 50_000 }}
          error={errors.healthParents}
          onValidChange={setHealthParents}
          onError={setError('healthParents')}
        />

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Parents Senior Citizen?</span>
          <button
            type="button"
            onClick={() => setParentsAreSenior(!parentsAreSenior)}
            className={`px-3 py-1 rounded-lg text-xs font-medium ${
              parentsAreSenior
                ? 'bg-primary-600 text-white'
                : 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300'
            }`}
          >
            {parentsAreSenior ? 'Yes (₹50K limit)' : 'No (₹25K limit)'}
          </button>
        </div>

        <SliderField
          id="tax-home-loan"
          label="Home Loan Interest (Section 24)"
          value={homeLoanInterest}
          min={0}
          max={200_000}
          step={10_000}
          display={formatCalculatorCurrency(homeLoanInterest)}
          minLabel="₹0"
          maxLabel="₹2L (max)"
          validation={{ type: 'amount', label: 'Home loan interest', min: 0, max: 200_000 }}
          error={errors.homeLoanInterest}
          onValidChange={setHomeLoanInterest}
          onError={setError('homeLoanInterest')}
        />
      </div>

      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
        <div className="text-center p-4 rounded-lg bg-success-50 dark:bg-success-900/20">
          <p className="text-xs text-surface-500">Total Tax Saved (Old Regime)</p>
          <p className="text-2xl font-extrabold font-mono text-success-600 mt-1">
            {formatCalculatorCurrency(result.taxSaved)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center">
            <p className="text-xs text-surface-500">Tax Without Deductions</p>
            <p className="text-sm font-bold font-mono text-danger-500 mt-1">
              {formatCalculatorCurrency(result.taxWithout)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500">Tax With Deductions</p>
            <p className="text-sm font-bold font-mono text-success-500 mt-1">
              {formatCalculatorCurrency(result.taxWith)}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-surface-200 dark:border-surface-700 space-y-2">
          <p className="text-xs font-semibold text-surface-700 dark:text-surface-300">Deductions Breakdown</p>
          <div className="space-y-1">
            {result.hraDeduction > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-surface-600 dark:text-surface-400">HRA Exemption</span>
                <span className="font-medium font-mono">{formatCalculatorCurrency(result.hraDeduction)}</span>
              </div>
            )}
            {result.deduction80C > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-surface-600 dark:text-surface-400">Section 80C</span>
                <span className="font-medium font-mono">{formatCalculatorCurrency(result.deduction80C)}</span>
              </div>
            )}
            {result.deduction80CCD > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-surface-600 dark:text-surface-400">NPS 80CCD(1B)</span>
                <span className="font-medium font-mono">{formatCalculatorCurrency(result.deduction80CCD)}</span>
              </div>
            )}
            {result.deduction80D > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-surface-600 dark:text-surface-400">Section 80D</span>
                <span className="font-medium font-mono">{formatCalculatorCurrency(result.deduction80D)}</span>
              </div>
            )}
            {result.deduction24 > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-surface-600 dark:text-surface-400">Section 24 (Home Loan)</span>
                <span className="font-medium font-mono">{formatCalculatorCurrency(result.deduction24)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-bold pt-1 border-t border-surface-200 dark:border-surface-700">
              <span className="text-surface-700 dark:text-surface-300">Total Deductions</span>
              <span className="text-primary-600 font-mono">{formatCalculatorCurrency(result.totalDeductions)}</span>
            </div>
          </div>
        </div>
        <CalculatorShareRow
          tool="Tax Saving Planner"
          summary={`Tax saved ${formatCalculatorCurrency(result.taxSaved)} · after deductions ${formatCalculatorCurrency(result.taxWith)}`}
          shareText={`Tax planning: saved ${formatCalculatorCurrency(result.taxSaved)} under Old Regime with ₹${(result.totalDeductions / 100000).toFixed(1)}L deductions.`}
        />
      </div>
    </div>
  );
}

export default withErrorBoundary(TaxSavingPlannerInner, 'Tax Saving Planner');
