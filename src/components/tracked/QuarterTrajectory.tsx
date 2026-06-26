import { useMemo, useState } from 'react';
import type {
  EntityQuarterChangeDetail,
  EntityQuarterHistoryRow,
  EntityStockChangeRow,
} from '../../lib/tracked-entities';

interface Props {
  history: EntityQuarterHistoryRow[];
  details: EntityQuarterChangeDetail[];
  quarterLabels: Record<string, string>;
  stockBase: string;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

function fmtCr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `₹${(value / 1000).toFixed(2)}k Cr`;
  if (value < 1 && value > 0) return `₹${(value * 100).toFixed(1)} L`;
  return `₹${value.toFixed(1)} Cr`;
}

function stockRightPct(r: EntityStockChangeRow): string {
  switch (r.changeType) {
    case 'fresh_entry':
      return `+${fmtPct(r.newPct)}`;
    case 'complete_exit':
      return `< 1% · was ${fmtPct(r.prevPct)}`;
    case 'increased':
    case 'decreased':
      return `${fmtPct(r.prevPct)} → ${fmtPct(r.newPct)}`;
    default:
      return fmtPct(r.newPct);
  }
}

function stockRightValue(r: EntityStockChangeRow): string {
  switch (r.changeType) {
    case 'complete_exit':
      return fmtCr(r.prevMarketValueCr);
    default:
      return fmtCr(r.marketValueCr);
  }
}

function bucketRows(rows: EntityStockChangeRow[]) {
  return {
    additions: rows.filter((r) => r.changeType === 'fresh_entry'),
    removals: rows.filter((r) => r.changeType === 'complete_exit'),
    increased: rows.filter((r) => r.changeType === 'increased'),
    decreased: rows.filter((r) => r.changeType === 'decreased'),
    unchanged: rows.filter((r) => r.changeType === 'unchanged'),
  };
}

function StockLine({
  name,
  slug,
  nseSymbol,
  pctLabel,
  valueLabel,
  tone,
  stockUrl,
}: {
  name: string;
  slug: string;
  nseSymbol: string | null;
  pctLabel: string;
  valueLabel: string;
  tone: 'green' | 'red' | 'blue' | 'amber' | 'neutral';
  stockUrl: (slug: string) => string;
}) {
  const toneClass =
    tone === 'green'
      ? 'text-success-600 dark:text-success-400'
      : tone === 'red'
        ? 'text-danger-600 dark:text-danger-400'
        : tone === 'blue'
          ? 'text-primary-600 dark:text-primary-400'
          : tone === 'amber'
            ? 'text-warning-600 dark:text-warning-400'
            : 'text-surface-600 dark:text-surface-300';

  return (
    <div className="flex justify-between gap-2 text-xs py-1.5 border-b border-surface-100 dark:border-surface-700 last:border-0">
      <a
        href={stockUrl(slug)}
        className="font-medium text-surface-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 min-w-0 truncate"
        title={name}
      >
        {name}
        {nseSymbol && <span className="block text-[10px] font-normal text-surface-400">{nseSymbol}</span>}
      </a>
      <div className={`text-right shrink-0 ${toneClass}`}>
        <div className="font-semibold">{pctLabel}</div>
        <div className="text-[10px] font-medium text-surface-500 dark:text-surface-400">{valueLabel}</div>
      </div>
    </div>
  );
}

function ChangePanel({
  title,
  dotClass,
  titleClass,
  empty,
  children,
}: {
  title: string;
  dotClass: string;
  titleClass: string;
  empty: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className={`text-xs font-semibold uppercase ${titleClass}`}>{title}</span>
      </div>
      {children ?? <p className="text-xs text-surface-400 italic">{empty}</p>}
    </div>
  );
}

function QuarterExpanded({
  detail,
  stockUrl,
  compareLabel,
  portfolioValueCr,
}: {
  detail: EntityQuarterChangeDetail;
  stockUrl: (slug: string) => string;
  compareLabel: string | null;
  portfolioValueCr: number | null;
}) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const buckets = useMemo(() => bucketRows(detail.rows), [detail.rows]);

  const renderList = (rows: EntityStockChangeRow[], tone: 'green' | 'red' | 'blue' | 'amber' | 'neutral', prefix: string) =>
    rows.map((r) => (
      <StockLine
        key={`${prefix}-${r.nseSymbol?.trim() || r.stockSlug}`}
        name={r.stockName}
        slug={r.stockSlug}
        nseSymbol={r.nseSymbol}
        pctLabel={stockRightPct(r)}
        valueLabel={stockRightValue(r)}
        tone={tone}
        stockUrl={stockUrl}
      />
    ));

  return (
    <div className="border-t border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-900/40">
      <div className="px-4 pt-3 flex flex-wrap items-center justify-between gap-2">
        {compareLabel && (
          <p className="text-xs text-surface-500 dark:text-surface-400">vs {compareLabel}</p>
        )}
        <p className="text-xs font-semibold text-surface-700 dark:text-surface-200 ml-auto">
          Total portfolio: <span className="text-primary-600 dark:text-primary-400">{fmtCr(portfolioValueCr)}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-700">
        <ChangePanel title="New additions" dotClass="bg-success-500" titleClass="text-success-700 dark:text-success-400" empty="No new stocks">
          {buckets.additions.length > 0 && <div>{renderList(buckets.additions, 'green', 'add')}</div>}
        </ChangePanel>
        <ChangePanel title="Below 1% (not in SHP)" dotClass="bg-danger-500" titleClass="text-danger-700 dark:text-danger-400" empty="No positions below disclosure threshold">
          {buckets.removals.length > 0 && <div>{renderList(buckets.removals, 'red', 'rem')}</div>}
        </ChangePanel>
        <ChangePanel title="Increased" dotClass="bg-primary-500" titleClass="text-primary-700 dark:text-primary-400" empty="No increases">
          {buckets.increased.length > 0 && <div>{renderList(buckets.increased, 'blue', 'inc')}</div>}
        </ChangePanel>
        <ChangePanel title="Decreased" dotClass="bg-warning-500" titleClass="text-warning-700 dark:text-warning-400" empty="No decreases">
          {buckets.decreased.length > 0 && <div>{renderList(buckets.decreased, 'amber', 'dec')}</div>}
        </ChangePanel>
      </div>

      {buckets.unchanged.length > 0 && (
        <div className="border-t border-surface-200 dark:border-surface-700 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowUnchanged((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold uppercase text-surface-600 dark:text-surface-300 hover:text-primary-600"
          >
            <span className="w-2 h-2 rounded-full bg-surface-400" />
            Unchanged ({buckets.unchanged.length})
            <span className="text-surface-400 font-normal normal-case">{showUnchanged ? '▾' : '▸'}</span>
          </button>
          {showUnchanged && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
              {renderList(buckets.unchanged, 'neutral', 'flat')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuarterTrajectory({ history, details, quarterLabels, stockBase }: Props) {
  const stockUrl = (slug: string) => `${stockBase}/${slug}`;
  const labelFor = (iso: string) => quarterLabels[iso] ?? iso;
  const [openQuarter, setOpenQuarter] = useState<string | null>(history[0]?.quarter ?? null);

  const detailByQuarter = useMemo(() => {
    const map = new Map<string, EntityQuarterChangeDetail>();
    for (const d of details) map.set(d.quarter, d);
    return map;
  }, [details]);

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-surface-500 dark:text-surface-400 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
              <th className="py-3 px-4 font-medium w-8" aria-hidden="true" />
              <th className="py-3 pr-4 font-medium">Quarter</th>
              <th className="py-3 px-4 font-medium text-right">Holdings</th>
              <th className="py-3 px-4 font-medium text-right">Adds</th>
              <th className="py-3 px-4 font-medium text-right">Trims</th>
              <th className="py-3 px-4 font-medium text-right">Portfolio value</th>
            </tr>
          </thead>
          {history.map((q) => {
            const adds = (q.freshEntries ?? 0) + (q.adds ?? 0);
            const trims = (q.exits ?? 0) + (q.trims ?? 0);
            const isOpen = openQuarter === q.quarter;
            const detail = detailByQuarter.get(q.quarter);
            const prevLabel = detail?.prevQuarter ? labelFor(detail.prevQuarter) : null;

            return (
              <tbody key={q.quarter} className="group">
                <tr
                  className={`border-b border-surface-100 dark:border-surface-800 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 ${
                    isOpen ? 'bg-surface-50 dark:bg-surface-800/50' : ''
                  }`}
                  onClick={() => setOpenQuarter(isOpen ? null : q.quarter)}
                >
                  <td className="py-3 px-4 text-surface-400 text-xs">{isOpen ? '▾' : '▸'}</td>
                  <td className="py-3 pr-4 font-medium text-surface-900 dark:text-white">{labelFor(q.quarter)}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{q.totalHoldings ?? '—'}</td>
                  <td className="py-3 px-4 text-right text-success-600 dark:text-success-400 tabular-nums">
                    {adds > 0 ? `+${adds}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right text-warning-600 dark:text-warning-400 tabular-nums">
                    {trims > 0 ? `−${trims}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-medium tabular-nums">{fmtCr(q.portfolioValueCr)}</td>
                </tr>
                {isOpen && detail && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <QuarterExpanded
                        detail={detail}
                        stockUrl={stockUrl}
                        compareLabel={prevLabel}
                        portfolioValueCr={q.portfolioValueCr}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-surface-500 dark:text-surface-400 border-t border-surface-100 dark:border-surface-800">
        Click a quarter to expand. Value = shares held × quarter-end closing price. Positions marked &lt; 1% dropped off the SHP filing (SEBI only discloses ≥1% holders) — a stake may still exist below that threshold.
      </p>
    </div>
  );
}
