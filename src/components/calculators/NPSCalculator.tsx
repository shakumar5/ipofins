import React, { useState } from 'react';
import {
  validateAmount,
  validateRate,
  validateInteger,
  safeFormatAmount,
} from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

interface NPSInputs {
  investment: string;
  age: string;
  retirementAge: string;
  expectedReturn: string;
}

function NPSCalculatorInner() {
  const [inputs, setInputs] = useState<NPSInputs>({
    investment: '',
    age: '',
    retirementAge: '',
    expectedReturn: '',
  });
  const [result, setResult] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof NPSInputs, string>>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const calculateNPS = () => {
    const investmentCheck = validateAmount(inputs.investment, 'Monthly investment', 500, 200_000);
    const ageCheck = validateInteger(inputs.age, 'Current age', 18, 65);
    const retirementCheck = validateInteger(inputs.retirementAge, 'Retirement age', 40, 75);
    const returnCheck = validateRate(inputs.expectedReturn, 'Expected return', 4, 15);

    const nextErrors: Partial<Record<keyof NPSInputs, string>> = {};
    if (!investmentCheck.isValid) nextErrors.investment = investmentCheck.error;
    if (!ageCheck.isValid) nextErrors.age = ageCheck.error;
    if (!retirementCheck.isValid) nextErrors.retirementAge = retirementCheck.error;
    if (!returnCheck.isValid) nextErrors.expectedReturn = returnCheck.error;

    const age = parseInt(inputs.age, 10);
    const retirementAge = parseInt(inputs.retirementAge, 10);
    if (ageCheck.isValid && retirementCheck.isValid && retirementAge <= age) {
      nextErrors.retirementAge = 'Retirement age must be greater than current age';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setResult(null);
      return;
    }

    const investment = parseFloat(inputs.investment);
    const expectedReturn = parseFloat(inputs.expectedReturn) / 100;
    const monthsToRetirement = (retirementAge - age) * 12;
    const monthlyRate = expectedReturn / 12;
    const futureValue =
      monthlyRate > 0
        ? investment * (Math.pow(1 + monthlyRate, monthsToRetirement) - 1) / monthlyRate
        : investment * monthsToRetirement;

    setResult(futureValue);
  };

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-surface-800 dark:text-white">NPS Calculator</h2>
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
            Current Age (Years)
          </label>
          <input
            type="number"
            name="age"
            value={inputs.age}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter current age"
          />
          {errors.age && <p className="mt-1 text-xs text-danger-600">{errors.age}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Retirement Age (Years)
          </label>
          <input
            type="number"
            name="retirementAge"
            value={inputs.retirementAge}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter retirement age"
          />
          {errors.retirementAge && <p className="mt-1 text-xs text-danger-600">{errors.retirementAge}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Expected Annual Return (%)
          </label>
          <input
            type="number"
            name="expectedReturn"
            value={inputs.expectedReturn}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter expected return"
          />
          {errors.expectedReturn && <p className="mt-1 text-xs text-danger-600">{errors.expectedReturn}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={calculateNPS}
        className="mt-4 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
      >
        Calculate NPS
      </button>
      {result !== null && (
        <>
          <div className="mt-4 p-4 bg-success-50 dark:bg-success-500/10 text-success-800 dark:text-success-300 rounded-md">
            <p className="font-mono">Expected corpus at retirement: {safeFormatAmount(result)}</p>
          </div>
          <CalculatorShareRow
            tool="NPS Calculator"
            summary={`₹${parseFloat(inputs.investment || '0').toLocaleString('en-IN')}/mo from age ${inputs.age} → ${safeFormatAmount(result)}`}
            shareText={`NPS corpus at ${inputs.retirementAge}: ₹${parseFloat(inputs.investment || '0').toLocaleString('en-IN')}/month at ${inputs.expectedReturn}% return.`}
          />
        </>
      )}
    </div>
  );
}

export default withErrorBoundary(NPSCalculatorInner, 'NPS Calculator');
