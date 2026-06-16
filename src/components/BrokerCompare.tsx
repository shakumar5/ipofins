import { useState, useMemo } from 'react';

interface Broker {
  name: string;
  slug: string;
  logo: string;
  type: string;
  rating: number;
  tradingFee: string;
  accountOpening: string;
  amc: string;
  platforms: string[];
  pros: string[];
  cons: string[];
}

interface Props {
  brokers: Broker[];
}

export default function BrokerCompare({ brokers }: Props) {
  const [selected, setSelected] = useState<string[]>([
    brokers[0]?.slug || '',
    brokers[1]?.slug || '',
    brokers[2]?.slug || '',
  ]);

  const handleChange = (index: number, value: string) => {
    const updated = [...selected];
    updated[index] = value;
    setSelected(updated);
  };

  const addSlot = () => {
    if (selected.length < 4) {
      const unused = brokers.find(b => !selected.includes(b.slug));
      setSelected([...selected, unused?.slug || brokers[0].slug]);
    }
  };

  const removeSlot = (index: number) => {
    if (selected.length > 2) {
      setSelected(selected.filter((_, i) => i !== index));
    }
  };

  const selectedBrokers = useMemo(() => {
    return selected
      .map(slug => brokers.find(b => b.slug === slug))
      .filter(Boolean) as Broker[];
  }, [selected, brokers]);

  const colClass = selected.length === 2
    ? 'grid-cols-3'
    : selected.length === 3
      ? 'grid-cols-4'
      : 'grid-cols-5';

  return (
    <div className="space-y-6">
      {/* Dropdown Selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        {selected.map((slug, index) => (
          <div key={index} className="flex-1 min-w-[140px] max-w-[200px]">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Broker {index + 1}
            </label>
            <div className="flex gap-1">
              <select
                value={slug}
                onChange={(e) => handleChange(index, e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
              >
                {brokers.map(b => (
                  <option key={b.slug} value={b.slug}>{b.name}</option>
                ))}
              </select>
              {selected.length > 2 && (
                <button
                  onClick={() => removeSlot(index)}
                  className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
        {selected.length < 4 && (
          <button
            onClick={addSlot}
            className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            + Add Broker
          </button>
        )}
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          {/* Header */}
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left py-4 px-4 font-semibold text-gray-500 dark:text-gray-400 min-w-[120px]">Feature</th>
              {selectedBrokers.map(broker => (
                <th key={broker.slug} className="text-center py-4 px-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{broker.logo}</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{broker.name}</span>
                    <span className="text-xs text-yellow-500">★ {broker.rating}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Broker Type */}
            <tr className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Broker Type</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${broker.type === 'discount' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                    {broker.type}
                  </span>
                </td>
              ))}
            </tr>
            {/* Trading Fee */}
            <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Trading Fee</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3 text-center font-semibold text-gray-900 dark:text-white">{broker.tradingFee}</td>
              ))}
            </tr>
            {/* Account Opening */}
            <tr className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Account Opening</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3 text-center">
                  <span className={broker.accountOpening === 'Free' ? 'text-green-500 font-semibold' : 'text-gray-900 dark:text-white font-semibold'}>{broker.accountOpening}</span>
                </td>
              ))}
            </tr>
            {/* AMC */}
            <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">AMC (Annual)</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3 text-center">
                  <span className={broker.amc === 'Free' ? 'text-green-500 font-semibold' : 'text-gray-900 dark:text-white font-semibold'}>{broker.amc}</span>
                </td>
              ))}
            </tr>

            {/* Platforms */}
            <tr className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Platforms</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3 text-center">
                  <div className="flex flex-wrap justify-center gap-1">
                    {broker.platforms.map((p, i) => (
                      <span key={i} className="inline-block px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300">{p}</span>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
            {/* Pros */}
            <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Strengths</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3">
                  <ul className="space-y-1">
                    {broker.pros.map((pro, i) => (
                      <li key={i} className="flex items-start gap-1 text-xs text-green-600 dark:text-green-400">
                        <span className="mt-0.5 flex-shrink-0">✓</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
            {/* Cons */}
            <tr className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Weaknesses</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3">
                  <ul className="space-y-1">
                    {broker.cons.map((con, i) => (
                      <li key={i} className="flex items-start gap-1 text-xs text-red-500 dark:text-red-400">
                        <span className="mt-0.5 flex-shrink-0">✗</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
            {/* Rating */}
            <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <td className="py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Our Rating</td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-3 px-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-yellow-500 text-sm">{'★'.repeat(Math.floor(broker.rating))}{broker.rating % 1 >= 0.5 ? '½' : ''}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{broker.rating}/5</span>
                  </div>
                </td>
              ))}
            </tr>
            {/* CTA */}
            <tr className="border-t border-gray-200 dark:border-gray-700">
              <td className="py-4 px-4"></td>
              {selectedBrokers.map(broker => (
                <td key={broker.slug} className="py-4 px-3 text-center">
                  <a href={`/broker/${broker.slug}`} className="inline-block px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                    View Details →
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
