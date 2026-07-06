import type { ReactNode } from 'react';
import { stockSignalPath } from '../../lib/stock-signal-meta';

interface Props {
  stockSlug?: string | null;
  href?: string;
  children: ReactNode;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/** Link to per-stock Stock Signal page when slug is known; otherwise plain text. */
export default function StockSignalLink({ stockSlug, href, children, className = '', onClick }: Props) {
  const target = href ?? (stockSlug ? stockSignalPath(stockSlug) : null);
  if (!target) {
    return <span className={className}>{children}</span>;
  }
  return (
    <a
      href={target}
      className={`text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
