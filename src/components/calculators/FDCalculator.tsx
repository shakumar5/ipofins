import React, { useState } from 'react';
import {
  validateAmount,
  validateRate,
  validateYears,
  validateInteger,
  safeFormatAmount,
} from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

interface FDInputs {
  principal: string;
  rate: string;
  time: string;
  compounding: string;
}

function FDCalculatorInner() {
  const [inputs, setInputs] = useState<FDInputs>({
    principal: '',
    rate: '',
    time: '',
    compounding: '4',
  });
  const [result, setResult] = useState<{ interest: number; maturity: number } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FDInputs, string>>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const calculateFD = () => {
    const principalCheck = validateAmount(inputs.principal, 'Principal amount', 1000, 10_000_000);
    const rateCheck = validateRate(inputs.rate, 'Interest rate', 1, 20);
    const timeCheck = validateYears(inputs.time, 1, 30);
    const compoundingCheck = validateInteger(inputs.compounding, 'Compounding frequency', 1, 12);

    const nextErrors: Partial<Record<keyof FDInputs, string>> = {};
    if (!principalCheck.isValid) nextErrors.principal = principalCheck.error;
    if (!rateCheck.isValid) nextErrors.rate = rateCheck.error;
    if (!timeCheck.isValid) nextErrors.time = timeCheck.error;
    if (!compoundingCheck.isValid) nextErrors.compounding = compoundingCheck.error;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setResult(null);
      return;
    }

    const principal = parseFloat(inputs.principal);
    const rate = parseFloat(inputs.rate) / 100;
    const time = parseFloat(inputs.time);
    const compounding = parseInt(inputs.compounding, 10);

    const finalAmount = principal * Math.pow(1 + rate / compounding, compounding * time);
    setResult({ interest: finalAmount - principal, maturity: finalAmount });
  };

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-surface-800 dark:text-white">FD Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Principal Amount (₹)
          </label>
          <input
            type="number"
            name="principal"
            value={inputs.principal}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter principal amount"
          />
          {errors.principal && <p className="mt-1 text-xs text-danger-600">{errors.principal}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Rate of Interest (%)
          </label>
          <input
            type="number"
            name="rate"
            value={inputs.rate}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter rate of interest"
          />
          {errors.rate && <p className="mt-1 text-xs text-danger-600">{errors.rate}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Time Period (Years)
          </label>
          <input
            type="number"
            name="time"
            value={inputs.time}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter time period"
          />
          {errors.time && <p className="mt-1 text-xs text-danger-600">{errors.time}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Compounding Frequency
          </label>
          <select
            name="compounding"
            value={inputs.compounding}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="1">Annually</option>
            <option value="2">Semi-Annually</option>
            <option value="4">Quarterly</option>
            <option value="12">Monthly</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={calculateFD}
        className="mt-4 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
      >
        Calculate FD
      </button>
      {result !== null && (
        <>
          <div className="mt-4 p-4 bg-success-50 dark:bg-success-500/10 text-success-800 dark:text-success-300 rounded-md space-y-1">
            <p className="font-mono">Maturity: {safeFormatAmount(result.maturity)}</p>
            <p className="font-mono text-sm">Interest earned: {safeFormatAmount(result.interest)}</p>
          </div>
          <CalculatorShareRow
            tool="FD Calculator"
            summary={`₹${parseFloat(inputs.principal).toLocaleString('en-IN')} @ ${inputs.rate}% for ${inputs.time}yr → ${safeFormatAmount(result.maturity)}`}
            shareText={`FD maturity: ₹${parseFloat(inputs.principal).toLocaleString('en-IN')} at ${inputs.rate}% for ${inputs.time} years → ${safeFormatAmount(result.maturity)}.`}
          />
        </>
      )}
    </div>
  );
}

export default withErrorBoundary(FDCalculatorInner, 'FD Calculator');
