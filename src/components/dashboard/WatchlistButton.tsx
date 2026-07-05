import { useCallback, useEffect, useState } from 'react';
import { isInWatchlist, toggleWatchlist } from '../../lib/local-dashboard';
import { withErrorBoundary } from '../withErrorBoundary';

interface Props {
  slug: string;
  name?: string;
  variant?: 'default' | 'compact';
  className?: string;
}

function WatchlistButtonInner({ slug, name, variant = 'default', className = '' }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isInWatchlist(slug));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ slug: string }>).detail;
      if (detail?.slug === slug) setActive(isInWatchlist(slug));
    };
    window.addEventListener('ipofins-watchlist-changed', onChange);
    return () => window.removeEventListener('ipofins-watchlist-changed', onChange);
  }, [slug]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActive(toggleWatchlist(slug));
    },
    [slug],
  );

  const label = active ? `Remove ${name ?? 'IPO'} from watchlist` : `Add ${name ?? 'IPO'} to watchlist`;

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`absolute top-2 right-2 z-10 p-1.5 rounded-lg border transition-colors ${
          active
            ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400'
            : 'bg-white/90 dark:bg-surface-800/90 border-surface-200 dark:border-surface-600 text-surface-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 focus:opacity-100'
        } ${className}`}
        aria-label={label}
        aria-pressed={active}
        title={active ? 'On watchlist' : 'Add to watchlist'}
      >
        <svg className="w-4 h-4" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
        active
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
          : 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:border-primary-400'
      } ${className}`}
      aria-label={label}
      aria-pressed={active}
    >
      <svg className="w-4 h-4" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
      {active ? 'On Watchlist' : 'Add to Watchlist'}
    </button>
  );
}

export default withErrorBoundary(WatchlistButtonInner, 'Watchlist');
