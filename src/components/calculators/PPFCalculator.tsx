import React, { useState } from 'react';

interface PPFInputs {
  investment: string;
  rate: string;
  years: string;
}

const PPFCalculator: React.FC = () => {
  const [inputs, setInputs] = useState<PPFInputs>({
    investment: '',
    rate: '',
    years: ''
  });
  const [result, setResult] = useState<number | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const calculatePPF = () => {
    const investment = parseFloat(inputs.investment);
    const rate = parseFloat(inputs.rate) / 100;
    const years = parseInt(inputs.years);

    if (isNaN(investment) || isNaN(rate) || isNaN(years)) {
      alert('Please enter valid numbers');
      return;
    }

    // PPF calculation
    // Future value of annuity formula: FV = P * [((1 + r)^n - 1) / r]
    // Where P = annual investment, r = annual interest rate, n = number of years
    const annualInvestment = investment * 12; // Monthly investment converted to annual
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
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter monthly investment"
          />
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
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter annual interest rate"
          />
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
            className="w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter investment period"
          />
        </div>
      </div>
      <button
        onClick={calculatePPF}
        className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
      >
        Calculate PPF
      </button>
      {result !== null && (
        <div className="mt-4 p-4 bg-green-100 text-green-800 rounded-md">
          <p>Maturity Amount: ₹{result.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
};

export default PPFCalculator;