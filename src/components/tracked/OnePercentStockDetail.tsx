import { useState, type ReactNode } from 'react';
import type { OnePercentRow, ShpCategorySummary, StockShareholdingDetail } from '../../lib/tracked-entities';
import {
  curatedEntityUrl,
  formatCr,
  formatPct,
  hasCuratedSuperInvestorInterest,
  hasSmartMoneyRadarInterest,
} from '../../lib/tracked-entities';
import StockNotOnRadarCard from './StockNotOnRadarCard';

interface Props {
  detail: StockShareholdingDetail;
  mfStockSignalUrl?: string | null;
}

type SectionKey = 'promoters' | 'fii' | 'mf' | 'dii' | 'superInvestors' | 'onePercentClub' | 'retail';

const CHART_COLORS: Record<string, string> = {
  promoters: 'bg-amber-500',
  fii: 'bg-blue-500',
  mf: 'bg-violet-500',
  dii: 'bg-teal-500',
  retail: 'bg-surface-400 dark:bg-surface-500',
};

function chartSegments(summary: ShpCategorySummary) {
  if (summary.dataQuality === 'verified') {
    return [
      { key: 'promoters', label: 'Promoters', pct: summary.promoterPct },
      { key: 'fii', label: 'FII', pct: summary.fiiPct },
      { key: 'mf', label: 'Mutual Funds', pct: summary.mfPct },
      { key: 'dii', label: 'DII (ex-MF)', pct: summary.diiExMfPct },
      { key: 'retail', label: 'Retail & others', pct: summary.retailPct },
    ].filter((s) => (s.pct ?? 0) > 0.01);
  }
  return [];
}

function HolderTable({ rows }: { rows: OnePercentRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-surface-500 dark:text-surface-400 py-2">No named holders ≥1% in this bucket.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-surface-500 border-b border-surface-200 dark:border-surface-700">
            <th className="py-2 pr-4 font-medium">Holder</th>
            <th className="py-2 px-4 font-medium text-right">Stake</th>
            <th className="py-2 px-4 font-medium text-right">Shares</th>
            <th className="py-2 pl-4 font-medium text-right">Value (₹ Cr)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const url = h.entitySlug ? curatedEntityUrl(h.entitySlug) : null;
            return (
              <tr key={h.id} className="border-b border-surface-100 dark:border-surface-800">
                <td className="py-2.5 pr-4 font-medium text-surface-900 dark:text-white">
                  {url ? (
                    <a href={url} className="hover:text-primary-600 dark:hover:text-primary-400 hover:underline">
                      {h.holderName}
                    </a>
                  ) : (
                    h.holderName
                  )}
                </td>
                <td className="py-2.5 px-4 text-right font-semibold tabular-nums">{formatPct(h.pctOfCompany)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-surface-600 dark:text-surface-300">
                  {h.shares != null ? Number(h.shares).toLocaleString('en-IN') : '—'}
                </td>
                <td className="py-2.5 pl-4 text-right tabular-nums">{formatCr(h.marketValueCr)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  pct,
  rows,
  defaultOpen,
  children,
}: {
  id: SectionKey;
  title: string;
  subtitle?: string;
  pct?: number | null;
  rows?: OnePercentRow[];
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const count = rows?.length ?? 0;

  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        id={`section-${id}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
      >
        <div className="min-w-0">
          <p className="font-semibold text-surface-900 dark:text-white">{title}</p>
          {subtitle && <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {pct != null && (
            <span className="text-sm font-bold tabular-nums text-primary-600 dark:text-primary-400">
              {formatPct(pct)}
            </span>
          )}
          {rows && (
            <span className="text-xs text-surface-500 tabular-nums">
              {count} named
            </span>
          )}
          <span className="text-surface-400 text-sm" aria-hidden>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-surface-100 dark:border-surface-800">
          {children ?? (rows ? <HolderTable rows={rows} /> : null)}
        </div>
      )}
    </div>
  );
}

export default function OnePercentStockDetail({ detail, mfStockSignalUrl = null }: Props) {
  const { summary, promoters, fii, mutualFunds, dii, superInvestors, onePercentClub } = detail;
  const segments = chartSegments(summary);
  const chartTotal = segments.reduce((s, x) => s + (x.pct ?? 0), 0);
  const onSmartMoneyRadar = hasSmartMoneyRadarInterest(detail);
  const hasCuratedSi = hasCuratedSuperInvestorInterest(detail);

  return (
    <div className="space-y-6">
      {!onSmartMoneyRadar && (
        <StockNotOnRadarCard
          stockName={detail.stockName}
          context="page"
          mfStockSignalUrl={mfStockSignalUrl}
        />
      )}
      {segments.length > 0 ? (
        <div className="card">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-1">Ownership breakdown</h2>
          <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
            Category totals from the official quarterly Shareholding Pattern filing
            {summary.quarter ? ` (${summary.quarter})` : ''}. Sums to {formatPct(chartTotal)}.
          </p>
          <div className="flex h-8 w-full rounded-lg overflow-hidden ring-1 ring-surface-200 dark:ring-surface-700">
            {segments.map((seg) => (
              <div
                key={seg.key}
                className={`${CHART_COLORS[seg.key] || 'bg-surface-300'} min-w-[2px]`}
                style={{ width: `${seg.pct}%` }}
                title={`${seg.label}: ${formatPct(seg.pct)}`}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-600 dark:text-surface-300">
            {segments.map((seg) => (
              <li key={seg.key} className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${CHART_COLORS[seg.key]}`} />
                {seg.label} {formatPct(seg.pct)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-surface-500 dark:text-surface-400">
            Super Investors and 1% Club names below are disclosed holders ≥1% — subsets of the categories above, not additive.
          </p>
        </div>
      ) : (
        <div className="card bg-warning-50/50 dark:bg-warning-950/20">
          <p className="text-sm text-surface-600 dark:text-surface-300">
            Category totals not yet parsed for this stock. Showing named ≥1% holders only. Re-run{' '}
            <code className="text-xs bg-surface-100 dark:bg-surface-800 px-1 rounded">pipeline:superinvestor</code>{' '}
            after migration 010.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-surface-900 dark:text-white">Holder details (≥1% disclosed names)</h2>
        <Section
          id="promoters"
          title="Promoters"
          subtitle="Promoter & promoter group"
          pct={summary.promoterPct}
          rows={promoters}
          defaultOpen={promoters.length > 0}
        />
        <Section id="fii" title="FII / FPI" subtitle="Foreign portfolio investors" pct={summary.fiiPct} rows={fii} />
        <Section
          id="mf"
          title="Mutual Funds"
          subtitle="Domestic mutual funds & UTI"
          pct={summary.mfPct}
          rows={mutualFunds}
        />
        <Section
          id="dii"
          title="DII (other)"
          subtitle="Insurance, banks, AIF, other domestic institutions"
          pct={summary.diiExMfPct}
          rows={dii}
        />
        <Section
          id="superInvestors"
          title="Super Investors"
          subtitle="Curated tracked investor profiles"
          rows={superInvestors}
          defaultOpen={superInvestors.length > 0}
        >
          {superInvestors.length === 0 && onSmartMoneyRadar && !hasCuratedSi ? (
            <p className="text-sm text-surface-600 dark:text-surface-300 py-2">
              No curated super investor holds ≥1% in the latest filing. See FII, DII, and mutual fund holders in the
              sections above.
            </p>
          ) : undefined}
        </Section>
        <Section
          id="onePercentClub"
          title="1% Club — Individuals & others"
          subtitle="Non-promoter ≥1% holders not matched to a curated profile"
          rows={onePercentClub}
        />
        <Section
          id="retail"
          title="Retail & others"
          subtitle="Holders below 1% disclosure threshold and public non-institutions"
          pct={summary.retailPct}
        >
          <p className="text-sm text-surface-600 dark:text-surface-300 py-2">
            SEBI requires naming only shareholders with ≥1% stake. The remaining{' '}
            <strong>{formatPct(summary.retailPct)}</strong> includes retail investors, small HNIs, employee trusts,
            and other holders below the disclosure threshold — aggregated in the official filing.
          </p>
        </Section>
      </div>
    </div>
  );
}
