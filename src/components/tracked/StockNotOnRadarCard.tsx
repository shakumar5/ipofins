import {
  getStockEmptyStateContent,
  type StockEmptyStateKind,
} from '../../lib/tracked-entities';

interface Props {
  stockName?: string;
  context?: 'search' | 'page';
  mfStockSignalUrl?: string | null;
  className?: string;
}

export default function StockNotOnRadarCard({
  stockName,
  context = 'page',
  mfStockSignalUrl = null,
  className = '',
}: Props) {
  const content = getStockEmptyStateContent({ stockName, mfStockSignalUrl, context });
  const tone = toneForKind(content.kind);

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${tone} ${className}`}
      role="status"
    >
      <p className="text-sm font-semibold text-surface-900 dark:text-white">{content.headline}</p>
      <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">{content.body}</p>
      {(content.primaryCta || content.secondaryCta) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {content.primaryCta && (
            <a
              href={content.primaryCta.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              {content.primaryCta.label}
              <span aria-hidden>→</span>
            </a>
          )}
          {content.secondaryCta && (
            <a
              href={content.secondaryCta.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary-400 transition-colors text-surface-800 dark:text-surface-100"
            >
              {content.secondaryCta.label}
            </a>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-surface-500 dark:text-surface-400">{content.footnote}</p>
    </div>
  );
}

function toneForKind(kind: StockEmptyStateKind): string {
  if (kind === 'not_indexed_mf_available' || kind === 'no_institutional_radar_mf_available') {
    return 'border-primary-200 dark:border-primary-900/50 bg-primary-50/50 dark:bg-primary-950/20';
  }
  return 'border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/60';
}
