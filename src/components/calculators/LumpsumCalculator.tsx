import React, { useState } from 'react';
import {
  validateAmount,
  validateRate,
  validateYears,
  safeFormatAmount,
} from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

interface LumpsumInputs {
  investment: string;
  rate: string;
  time: string;
}

function LumpsumCalculatorInner() {
  const [inputs, setInputs] = useState<LumpsumInputs>({
    investment: '',
    rate: '',
    time: '',
  });
  const [result, setResult] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof LumpsumInputs, string>>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const calculateLumpsum = () => {
    const investmentCheck = validateAmount(inputs.investment, 'Investment amount', 1000, 10_000_000);
    const rateCheck = validateRate(inputs.rate, 'Expected return', 1, 30);
    const timeCheck = validateYears(inputs.time, 1, 40);

    const nextErrors: Partial<Record<keyof LumpsumInputs, string>> = {};
    if (!investmentCheck.isValid) nextErrors.investment = investmentCheck.error;
    if (!rateCheck.isValid) nextErrors.rate = rateCheck.error;
    if (!timeCheck.isValid) nextErrors.time = timeCheck.error;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setResult(null);
      return;
    }

    const investment = parseFloat(inputs.investment);
    const rate = parseFloat(inputs.rate) / 100;
    const time = parseFloat(inputs.time);
    const finalAmount = investment * Math.pow(1 + rate, time);
    setResult(finalAmount - investment);
  };

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-surface-800 dark:text-white">Lumpsum Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Lumpsum Investment (₹)
          </label>
          <input
            type="number"
            name="investment"
            value={inputs.investment}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter lumpsum investment"
          />
          {errors.investment && <p className="mt-1 text-xs text-danger-600">{errors.investment}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Expected Annual Return (%)
          </label>
          <input
            type="number"
            name="rate"
            value={inputs.rate}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter expected annual return"
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
      </div>
      <button
        type="button"
        onClick={calculateLumpsum}
        className="mt-4 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
      >
        Calculate Lumpsum
      </button>
      {result !== null && (
        <>
          <div className="mt-4 p-4 bg-success-50 dark:bg-success-500/10 text-success-800 dark:text-success-300 rounded-md">
            <p className="font-mono">Expected returns: {safeFormatAmount(result)}</p>
          </div>
          <CalculatorShareRow
            tool="Lumpsum Calculator"
            summary={`₹${parseFloat(inputs.investment || '0').toLocaleString('en-IN')} @ ${inputs.rate}% for ${inputs.time}yr → ${safeFormatAmount(result)}`}
            shareText={`Lumpsum investment: ₹${parseFloat(inputs.investment || '0').toLocaleString('en-IN')} at ${inputs.rate}% for ${inputs.time} years.`}
          />
        </>
      )}
    </div>
  );
}

export default withErrorBoundary(LumpsumCalculatorInner, 'Lumpsum Calculator');
