import { useMemo, useState, type ReactNode } from 'react';
import {
  formatCr,
  formatPct,
  formatQoQDisplay,
  onePercentStockUrl,
  type EntityHoldingRow,
} from '../../lib/tracked-entities';

type SortKey = 'stock' | 'stake' | 'priorStake' | 'qoq' | 'value' | 'shares';

const SORT_LABELS: Record<SortKey, string> = {
  stock: 'Stock',
  stake: 'Stake',
  priorStake: 'Prior stake',
  qoq: 'QoQ',
  value: 'Value',
  shares: 'Shares',
};

const MOBILE_SORT_KEYS: SortKey[] = ['stake', 'value', 'qoq', 'priorStake', 'shares', 'stock'];

interface Props {
  holdings: EntityHoldingRow[];
}

function qoqToneClass(tone: string): string {
  switch (tone) {
    case 'new':
      return 'bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300';
    case 'exit':
      return 'bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300';
    case 'up':
      return 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300';
    case 'down':
      return 'bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-300';
    case 'flat':
      return 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300';
    default:
      return 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300';
  }
}

function numOrNegInfinity(value: number | null | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

function qoqSortValue(row: EntityHoldingRow): number {
  const type = row.changeType;
  if (type === 'fresh_entry') return 1000 + (row.pctOfCompany ?? 0);
  if (type === 'complete_exit') return -1000 - (row.prevPct ?? 0);
  if (type === 'increased' || type === 'decreased') return row.pctChange ?? 0;
  return 0;
}

function sortHoldings(rows: EntityHoldingRow[], sortBy: SortKey, sortDir: 'asc' | 'desc'): EntityHoldingRow[] {
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'stock':
        cmp = a.stockName.localeCompare(b.stockName);
        if (cmp === 0) cmp = (a.nseSymbol ?? '').localeCompare(b.nseSymbol ?? '');
        break;
      case 'stake':
        cmp = numOrNegInfinity(a.pctOfCompany) - numOrNegInfinity(b.pctOfCompany);
        break;
      case 'priorStake':
        cmp = numOrNegInfinity(a.prevPct) - numOrNegInfinity(b.prevPct);
        break;
      case 'qoq':
        cmp = qoqSortValue(a) - qoqSortValue(b);
        break;
      case 'value':
        cmp = numOrNegInfinity(a.marketValueCr) - numOrNegInfinity(b.marketValueCr);
        break;
      case 'shares':
        cmp = numOrNegInfinity(a.shares) - numOrNegInfinity(b.shares);
        break;
    }
    if (cmp === 0) cmp = a.stockName.localeCompare(b.stockName);
    return cmp * dir;
  });
}

export default function SuperInvestorHoldingsTable({ holdings }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('stake');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => sortHoldings(holdings, sortBy, sortDir), [holdings, sortBy, sortDir]);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(col);
      setSortDir(col === 'stock' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="ml-0.5 inline-block normal-case">
      {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  const SortHeader = ({
    col,
    children,
    align = 'left',
    title,
  }: {
    col: SortKey;
    children: ReactNode;
    align?: 'left' | 'right' | 'center';
    title?: string;
  }) => (
    <button
      type="button"
      onClick={() => handleSort(col)}
      title={title}
      aria-sort={sortBy === col ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
      className={`hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer uppercase font-medium ${
        align === 'right' ? 'w-full text-right' : align === 'center' ? 'w-full text-center' : 'text-left'
      }`}
    >
      {children}
      <SortIcon col={col} />
    </button>
  );

  if (!holdings.length) return null;

  return (
    <div>
      <p className="text-xs text-surface-500 dark:text-surface-400 mb-3">
        {holdings.length} stocks · Sorted by {SORT_LABELS[sortBy]} (
        {sortBy === 'stock'
          ? sortDir === 'asc'
            ? 'A to Z'
            : 'Z to A'
          : sortDir === 'desc'
            ? 'high to low'
            : 'low to high'}
        )
      </p>

      <div className="md:hidden flex flex-wrap gap-2 mb-3">
        <span className="text-xs text-surface-500 self-center">Sort:</span>
        {MOBILE_SORT_KEYS.map((col) => (
          <button
            key={col}
            type="button"
            onClick={() => handleSort(col)}
            className={`text-xs px-2 py-1 rounded ${
              sortBy === col
                ? 'bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-medium'
                : 'text-surface-500 hover:text-primary-600 dark:hover:text-primary-400'
            }`}
          >
            {SORT_LABELS[col]}
            {sortBy === col && (sortDir === 'desc' ? ' ↓' : ' ↑')}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto card p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-surface-500 dark:text-surface-400 border-b border-surface-200 dark:border-surface-700">
              <th className="py-3 px-4">
                <SortHeader col="stock">Stock</SortHeader>
              </th>
              <th className="py-3 px-4">
                <SortHeader col="stake" align="right">Stake</SortHeader>
              </th>
              <th className="py-3 px-4">
                <SortHeader col="priorStake" align="right">Prior stake</SortHeader>
              </th>
              <th className="py-3 px-4">
                <SortHeader col="qoq" align="center" title="Quarter-on-quarter change">
                  QoQ
                </SortHeader>
              </th>
              <th className="py-3 px-4">
                <SortHeader col="value" align="right">Value (₹ Cr)</SortHeader>
              </th>
              <th className="py-3 px-4">
                <SortHeader col="shares" align="right">Shares</SortHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const qoq = formatQoQDisplay(h);
              const stockUrl = onePercentStockUrl(h.stockSlug);
              return (
                <tr
                  key={h.stockSlug}
                  className="border-b border-surface-100 dark:border-surface-800"
                >
                  <td className="py-3 px-4">
                    <a
                      href={stockUrl}
                      className="font-medium text-surface-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {h.stockName}
                    </a>
                    {h.nseSymbol && <span className="block text-xs text-surface-500">{h.nseSymbol}</span>}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold tabular-nums">{formatPct(h.pctOfCompany)}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-surface-600 dark:text-surface-300">
                    {h.changeType === 'fresh_entry' ? '—' : formatPct(h.prevPct)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded ${qoqToneClass(qoq.tone)}`}
                      title={qoq.hint}
                    >
                      {qoq.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">{formatCr(h.marketValueCr)}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-surface-600 dark:text-surface-300">
                    {h.shares != null ? Number(h.shares).toLocaleString('en-IN') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
