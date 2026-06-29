import { useMemo, type ReactNode } from 'react';
import type { OnePercentRow, ShpCategorySummary, StockShareholdingDetail } from '../../lib/tracked-entities';
import { curatedEntityUrl, hasCuratedSuperInvestorInterest, hasSmartMoneyRadarInterest } from '../../lib/tracked-client';
import { formatCr, formatPct } from '../../lib/tracked-display';
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

/** Matches ownership chart + holder section headers. */
const SECTION_STYLES: Record<
  SectionKey,
  { dot: string; border: string; pct: string; headerBg: string }
> = {
  promoters: {
    dot: 'bg-amber-500',
    border: 'border-l-amber-500',
    pct: 'text-amber-700 dark:text-amber-400',
    headerBg: 'hover:bg-amber-50/80 dark:hover:bg-amber-950/20',
  },
  fii: {
    dot: 'bg-blue-500',
    border: 'border-l-blue-500',
    pct: 'text-blue-700 dark:text-blue-400',
    headerBg: 'hover:bg-blue-50/80 dark:hover:bg-blue-950/20',
  },
  mf: {
    dot: 'bg-violet-500',
    border: 'border-l-violet-500',
    pct: 'text-violet-700 dark:text-violet-400',
    headerBg: 'hover:bg-violet-50/80 dark:hover:bg-violet-950/20',
  },
  dii: {
    dot: 'bg-teal-500',
    border: 'border-l-teal-500',
    pct: 'text-teal-700 dark:text-teal-400',
    headerBg: 'hover:bg-teal-50/80 dark:hover:bg-teal-950/20',
  },
  superInvestors: {
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    pct: 'text-emerald-700 dark:text-emerald-400',
    headerBg: 'hover:bg-emerald-50/80 dark:hover:bg-emerald-950/20',
  },
  onePercentClub: {
    dot: 'bg-orange-500',
    border: 'border-l-orange-500',
    pct: 'text-orange-700 dark:text-orange-400',
    headerBg: 'hover:bg-orange-50/80 dark:hover:bg-orange-950/20',
  },
  retail: {
    dot: 'bg-surface-400 dark:bg-surface-500',
    border: 'border-l-surface-400 dark:border-l-surface-500',
    pct: 'text-surface-700 dark:text-surface-300',
    headerBg: 'hover:bg-surface-50 dark:hover:bg-surface-800/50',
  },
};

function hasSectionData(section: { rows?: OnePercentRow[]; pct?: number | null }): boolean {
  return (section.rows?.length ?? 0) > 0 || (section.pct != null && section.pct > 0.01);
}

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
            const trackedAs =
              h.entityDisplayName &&
              h.entityDisplayName.trim().toLowerCase() !== h.holderName.trim().toLowerCase()
                ? h.entityDisplayName
                : null;
            return (
              <tr key={h.entitySlug ? `entity:${h.entitySlug}:${h.id}` : `holder:${h.id}`} className="border-b border-surface-100 dark:border-surface-800">
                <td className="py-2.5 pr-4 text-surface-900 dark:text-white">
                  <div className="font-medium">{h.holderName}</div>
                  {url && trackedAs && (
                    <a
                      href={url}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-0.5 inline-block"
                    >
                      Tracked as {trackedAs} →
                    </a>
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
  hasData,
  children,
}: {
  id: SectionKey;
  title: string;
  subtitle?: string;
  pct?: number | null;
  rows?: OnePercentRow[];
  defaultOpen?: boolean;
  hasData: boolean;
  children?: ReactNode;
}) {
  const count = rows?.length ?? 0;
  const styles = SECTION_STYLES[id];

  return (
    <details
      id={`section-${id}`}
      className={`shp-holder-section card p-0 overflow-hidden border-l-4 transition-opacity ${
        hasData ? styles.border : 'border-l-transparent opacity-55'
      }`}
      open={defaultOpen || undefined}
    >
      <summary
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
          hasData ? styles.headerBg : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'
        }`}
      >
        <div className="min-w-0 flex items-start gap-2.5">
          <span
            className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-sm shrink-0 ${
              hasData ? styles.dot : 'bg-surface-300 dark:bg-surface-600'
            }`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className={`font-semibold ${hasData ? 'text-surface-900 dark:text-white' : 'text-surface-500 dark:text-surface-400'}`}>
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {pct != null && pct > 0 && (
            <span className={`text-sm font-bold tabular-nums ${hasData ? styles.pct : 'text-surface-400'}`}>
              {formatPct(pct)}
            </span>
          )}
          {rows && (
            <span className={`text-xs tabular-nums ${hasData ? 'text-surface-600 dark:text-surface-300' : 'text-surface-400'}`}>
              {count > 0 ? `${count} named` : 'No names'}
            </span>
          )}
          {!hasData && !rows && pct != null && pct <= 0.01 && (
            <span className="text-xs text-surface-400">No data</span>
          )}
          <span className="shp-section-chevron text-surface-400 text-sm" aria-hidden>
            ▼
          </span>
        </div>
      </summary>
      <div className="px-4 pb-4 border-t border-surface-100 dark:border-surface-800">
        {children ?? (rows ? <HolderTable rows={rows} /> : null)}
      </div>
    </details>
  );
}

function sectionWeight(section: {
  rows?: OnePercentRow[];
  pct?: number | null;
}): number {
  if (!hasSectionData(section)) return 0;
  const rowScore = (section.rows?.length ?? 0) * 2;
  const pctScore = section.pct != null && section.pct > 0 ? Math.min(section.pct, 50) : 0;
  return rowScore + pctScore;
}

export default function OnePercentStockDetail({ detail, mfStockSignalUrl = null }: Props) {
  const { summary, promoters, fii, mutualFunds, dii, superInvestors, onePercentClub } = detail;
  const segments = chartSegments(summary);
  const chartTotal = segments.reduce((s, x) => s + (x.pct ?? 0), 0);
  const onSmartMoneyRadar = hasSmartMoneyRadarInterest(detail);
  const hasCuratedSi = hasCuratedSuperInvestorInterest(detail);
  const superInvestorTotalPct = superInvestors.reduce((s, h) => s + (h.pctOfCompany ?? 0), 0);
  const onePercentClubTotalPct = onePercentClub.reduce((s, h) => s + (h.pctOfCompany ?? 0), 0);

  const holderSections = useMemo(() => {
    const items: Array<{
      id: SectionKey;
      title: string;
      subtitle: string;
      pct: number | null;
      rows?: OnePercentRow[];
      defaultOpen?: boolean;
      children?: ReactNode;
      hasData: boolean;
    }> = [
      {
        id: 'promoters',
        title: 'Promoters',
        subtitle: 'Promoter & promoter group',
        pct: summary.promoterPct,
        rows: promoters,
        hasData: false,
      },
      {
        id: 'fii',
        title: 'FII / FPI',
        subtitle: 'Foreign portfolio investors',
        pct: summary.fiiPct,
        rows: fii,
        hasData: false,
      },
      {
        id: 'mf',
        title: 'Mutual Funds',
        subtitle: 'Domestic mutual funds & UTI',
        pct: summary.mfPct,
        rows: mutualFunds,
        hasData: false,
      },
      {
        id: 'dii',
        title: 'DII (other)',
        subtitle: 'Insurance, banks, AIF, other domestic institutions',
        pct: summary.diiExMfPct,
        rows: dii,
        hasData: false,
      },
      {
        id: 'superInvestors',
        title: 'Super Investors',
        subtitle: 'Curated tracked investor profiles',
        pct: superInvestorTotalPct > 0 ? superInvestorTotalPct : null,
        rows: superInvestors,
        hasData: false,
      },
      {
        id: 'onePercentClub',
        title: '1% Club — Individuals & others',
        subtitle: 'Non-promoter ≥1% holders not matched to a curated profile',
        pct: onePercentClubTotalPct > 0 ? onePercentClubTotalPct : null,
        rows: onePercentClub,
        hasData: false,
      },
      {
        id: 'retail',
        title: 'Retail & others',
        subtitle: 'Holders below 1% disclosure threshold and public non-institutions',
        pct: summary.retailPct,
        rows: undefined,
        hasData: false,
        children: (
          <p className="text-sm text-surface-600 dark:text-surface-300 py-2">
            SEBI requires naming only shareholders with ≥1% stake. The remaining{' '}
            <strong>{formatPct(summary.retailPct)}</strong> includes retail investors, small HNIs, employee trusts,
            and other holders below the disclosure threshold — aggregated in the official filing.
          </p>
        ),
      },
    ].map((section) => ({
      ...section,
      hasData: hasSectionData(section),
    })) as Array<{
      id: SectionKey;
      title: string;
      subtitle: string;
      pct: number | null;
      rows?: OnePercentRow[];
      defaultOpen?: boolean;
      children?: ReactNode;
      hasData: boolean;
    }>;

    return [...items].sort((a, b) => sectionWeight(b) - sectionWeight(a) || a.title.localeCompare(b.title));
  }, [
    summary,
    promoters,
    fii,
    mutualFunds,
    dii,
    superInvestors,
    onePercentClub,
    superInvestorTotalPct,
    onePercentClubTotalPct,
  ]);

  const topSectionWithData = holderSections.find((s) => s.hasData)?.id;

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
            {superInvestorTotalPct > 0.01 && (
              <li className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SECTION_STYLES.superInvestors.dot}`} />
                Super Investors {formatPct(superInvestorTotalPct)} <span className="text-surface-400">(subset)</span>
              </li>
            )}
            {onePercentClubTotalPct > 0.01 && (
              <li className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SECTION_STYLES.onePercentClub.dot}`} />
                1% Club {formatPct(onePercentClubTotalPct)} <span className="text-surface-400">(subset)</span>
              </li>
            )}
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
        {holderSections.map((section) => (
          <Section
            key={section.id}
            id={section.id}
            title={section.title}
            subtitle={section.subtitle}
            pct={section.pct}
            rows={section.rows}
            hasData={section.hasData}
            defaultOpen={section.id === topSectionWithData}
          >
            {section.id === 'superInvestors' && section.rows?.length === 0 && onSmartMoneyRadar && !hasCuratedSi ? (
              <p className="text-sm text-surface-600 dark:text-surface-300 py-2">
                No curated super investor holds ≥1% in the latest filing. See FII, DII, and mutual fund holders in the
                sections above.
              </p>
            ) : (
              section.children
            )}
          </Section>
        ))}
      </div>
    </div>
  );
}
