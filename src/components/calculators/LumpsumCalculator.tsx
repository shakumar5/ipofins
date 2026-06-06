import React, { useState } from 'react';

interface LumpsumInputs {
  investment: string;
  rate: string;
  time: string;
}

const LumpsumCalculator: React.FC = () => {
  const [inputs, setInputs] = useState<LumpsumInputs>({
    investment: '',
    rate: '',
    time: ''
  });
  const [result, setResult] = useState<number | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const calculateLumpsum = () => {
    const investment = parseFloat(inputs.investment);
    const rate = parseFloat(inputs.rate) / 100;
    const time = parseFloat(inputs.time);

    if (isNaN(investment) || isNaN(rate) || isNaN(time)) {
      alert('Please enter valid numbers');
      return;
    }

    // Lumpsum calculation formula: A = P(1 + r)^t
    // A = final amount, P = principal, r = rate, t = time
    const finalAmount = investment * Math.pow(1 + rate, time);
    const interest = finalAmount - investment;
    
    setResult(interest);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">Lumpsum Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Lumpsum Investment (₹)
          </label>
          <input
            type="number"
            name="investment"
            value={inputs.investment}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter lumpsum investment"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Expected Annual Return (%)
          </label>
          <input
            type="number"
            name="rate"
            value={inputs.rate}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter expected annual return"
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
      </div>
      <button
        onClick={calculateLumpsum}
        className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
      >
        Calculate Lumpsum
      </button>
      {result !== null && (
        <div className="mt-4 p-4 bg-green-100 text-green-800 rounded-md">
          <p>Expected Returns: ₹{result.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
};

export default LumpsumCalculator;