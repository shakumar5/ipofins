import React, { useState } from 'react';

interface NPSInputs {
  investment: string;
  age: string;
  retirementAge: string;
  expectedReturn: string;
}

const NPSCalculator: React.FC = () => {
  const [inputs, setInputs] = useState<NPSInputs>({
    investment: '',
    age: '',
    retirementAge: '',
    expectedReturn: ''
  });
  const [result, setResult] = useState<number | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const calculateNPS = () => {
    const investment = parseFloat(inputs.investment);
    const age = parseInt(inputs.age);
    const retirementAge = parseInt(inputs.retirementAge);
    const expectedReturn = parseFloat(inputs.expectedReturn) / 100;

    if (isNaN(investment) || isNaN(age) || isNaN(retirementAge) || isNaN(expectedReturn)) {
      alert('Please enter valid numbers');
      return;
    }

    // NPS calculation
    // Assuming 12% annual return and monthly contributions
    const yearsToRetirement = retirementAge - age;
    const monthsToRetirement = yearsToRetirement * 12;
    const monthlyContribution = investment;
    
    // Future value of monthly investments: FV = P * [((1 + r)^n - 1) / r]
    // Where P = monthly payment, r = monthly interest rate, n = number of months
    const monthlyRate = expectedReturn / 12;
    const futureValue = monthlyContribution * (Math.pow(1 + monthlyRate, monthsToRetirement) - 1) / monthlyRate;
    
    setResult(futureValue);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">NPS Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Monthly Investment (₹)
          </label>
          <input
            type="number"
            name="investment"
            value={inputs.investment}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter monthly investment"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Current Age (Years)
          </label>
          <input
            type="number"
            name="age"
            value={inputs.age}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter current age"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Retirement Age (Years)
          </label>
          <input
            type="number"
            name="retirementAge"
            value={inputs.retirementAge}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter retirement age"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Expected Annual Return (%)
          </label>
          <input
            type="number"
            name="expectedReturn"
            value={inputs.expectedReturn}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter expected return"
          />
        </div>
      </div>
      <button
        onClick={calculateNPS}
        className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
      >
        Calculate NPS
      </button>
      {result !== null && (
        <div className="mt-4 p-4 bg-green-100 text-green-800 rounded-md">
          <p>Expected Corpus at Retirement: ₹{result.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
};

export default NPSCalculator;