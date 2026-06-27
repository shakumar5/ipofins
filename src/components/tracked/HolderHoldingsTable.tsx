import { formatCr, formatPct } from '../../lib/tracked-display';
import type { HolderPosition } from '../../lib/one-percent-holder-positions';

interface Props {
  positions: HolderPosition[];
  stockBase: string;
  loading?: boolean;
  emptyMessage?: string;
}

export default function HolderHoldingsTable({
  positions,
  stockBase,
  loading = false,
  emptyMessage = 'No >=1% holdings found in the latest quarter.',
}: Props) {
  if (loading) {
    return (
      <p className="text-sm text-surface-500 dark:text-surface-400 px-4 py-6 text-center">
        Loading holdings...
      </p>
    );
  }

  if (!positions.length) {
    return (
      <p className="text-sm text-surface-600 dark:text-surface-300 px-4 py-6 text-center">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-surface-500 dark:text-surface-400 border-b border-surface-200 dark:border-surface-700">
            <th className="py-2 px-4 font-medium">Stock</th>
            <th className="py-2 px-4 font-medium text-right">Holding</th>
            <th className="py-2 px-4 font-medium text-right">Shares</th>
            <th className="py-2 pl-4 pr-4 font-medium text-right">Value (Cr)</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr
              key={p.stockSlug}
              className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/40"
            >
              <td className="py-2.5 px-4">
                <a
                  href={`${stockBase}/${p.stockSlug}`}
                  className="font-medium text-surface-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {p.stockName}
                </a>
              </td>
              <td className="py-2.5 px-4 text-right font-semibold tabular-nums">
                {formatPct(p.pct)}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums text-surface-600 dark:text-surface-300">
                {p.shares != null ? Number(p.shares).toLocaleString('en-IN') : '-'}
              </td>
              <td className="py-2.5 pl-4 pr-4 text-right tabular-nums font-medium">
                {formatCr(p.marketValueCr)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}