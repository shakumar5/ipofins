import React, { useState } from 'react';
import {
  validateAmount,
  validateRate,
  validateYears,
  safeFormatAmount,
} from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

interface PPFInputs {
  investment: string;
  rate: string;
  years: string;
}

function PPFCalculatorInner() {
  const [inputs, setInputs] = useState<PPFInputs>({
    investment: '',
    rate: '',
    years: '',
  });
  const [result, setResult] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof PPFInputs, string>>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const calculatePPF = () => {
    const investmentCheck = validateAmount(inputs.investment, 'Monthly investment', 500, 12_500);
    const rateCheck = validateRate(inputs.rate, 'Interest rate', 5, 10);
    const yearsCheck = validateYears(inputs.years, 15, 50);

    const nextErrors: Partial<Record<keyof PPFInputs, string>> = {};
    if (!investmentCheck.isValid) nextErrors.investment = investmentCheck.error;
    if (!rateCheck.isValid) nextErrors.rate = rateCheck.error;
    if (!yearsCheck.isValid) nextErrors.years = yearsCheck.error;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setResult(null);
      return;
    }

    const investment = parseFloat(inputs.investment);
    const rate = parseFloat(inputs.rate) / 100;
    const years = parseInt(inputs.years, 10);
    const annualInvestment = investment * 12;
    const futureValue = annualInvestment * (Math.pow(1 + rate, years) - 1) / rate;
    setResult(futureValue);
  };

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-surface-800 dark:text-white">PPF Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Monthly Investment (₹)
          </label>
          <input
            type="number"
            name="investment"
            value={inputs.investment}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter monthly investment"
          />
          {errors.investment && <p className="mt-1 text-xs text-danger-600">{errors.investment}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Annual Interest Rate (%)
          </label>
          <input
            type="number"
            name="rate"
            value={inputs.rate}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter annual interest rate"
          />
          {errors.rate && <p className="mt-1 text-xs text-danger-600">{errors.rate}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Investment Period (Years)
          </label>
          <input
            type="number"
            name="years"
            value={inputs.years}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter investment period"
          />
          {errors.years && <p className="mt-1 text-xs text-danger-600">{errors.years}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={calculatePPF}
        className="mt-4 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
      >
        Calculate PPF
      </button>
      {result !== null && (
        <>
          <div className="mt-4 p-4 bg-success-50 dark:bg-success-500/10 text-success-800 dark:text-success-300 rounded-md">
            <p className="font-mono">Maturity amount: {safeFormatAmount(result)}</p>
          </div>
          <CalculatorShareRow
            tool="PPF Calculator"
            summary={`₹${parseFloat(inputs.investment || '0').toLocaleString('en-IN')}/yr for ${inputs.years}yr → ${safeFormatAmount(result)}`}
            shareText={`PPF maturity: ₹${parseFloat(inputs.investment || '0').toLocaleString('en-IN')}/year at ${inputs.rate}% for ${inputs.years} years.`}
          />
        </>
      )}
    </div>
  );
}

export default withErrorBoundary(PPFCalculatorInner, 'PPF Calculator');
