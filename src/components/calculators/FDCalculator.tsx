import React, { useState } from 'react';

interface FDInputs {
  principal: string;
  rate: string;
  time: string;
  compounding: string;
}

const FDCalculator: React.FC = () => {
  const [inputs, setInputs] = useState<FDInputs>({
    principal: '',
    rate: '',
    time: '',
    compounding: ''
  });
  const [result, setResult] = useState<number | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const calculateFD = () => {
    const principal = parseFloat(inputs.principal);
    const rate = parseFloat(inputs.rate) / 100;
    const time = parseFloat(inputs.time);
    const compounding = parseFloat(inputs.compounding);

    if (isNaN(principal) || isNaN(rate) || isNaN(time) || isNaN(compounding)) {
      alert('Please enter valid numbers');
      return;
    }

    // FD calculation formula: A = P(1 + r/n)^(nt)
    // A = final amount, P = principal, r = rate, n = compounding frequency, t = time
    const finalAmount = principal * Math.pow(1 + rate / compounding, compounding * time);
    
    const interest = finalAmount - principal;
    
    setResult(interest);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">FD Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Principal Amount (₹)
          </label>
          <input
            type="number"
            name="principal"
            value={inputs.principal}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter principal amount"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Rate of Interest (%)
          </label>
          <input
            type="number"
            name="rate"
            value={inputs.rate}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter rate of interest"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Time Period (Years)
          </label>
          <input
            type="number"
            name="time"
            value={inputs.time}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter time period"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Compounding Frequency
          </label>
          <select
            name="compounding"
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="1">Annually</option>
            <option value="2">Semi-Annually</option>
            <option value="4">Quarterly</option>
            <option value="12">Monthly</option>
          </select>
        </div>
      </div>
      <button
        onClick={calculateFD}
        className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
      >
        Calculate FD
      </button>
      {result !== null && (
        <div className="mt-4 p-4 bg-green-100 text-green-800 rounded-md">
          <p>Maturity Amount: ₹{result.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
};

export default FDCalculator;