import type { ReactNode } from 'react';
import { stockSignalPath } from '../../lib/stock-signal-meta';

interface Props {
  stockSlug?: string | null;
  children: ReactNode;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/** Link to per-stock Stock Signal page when slug is known; otherwise plain text. */
export default function StockSignalLink({ stockSlug, children, className = '', onClick }: Props) {
  if (!stockSlug) {
    return <span className={className}>{children}</span>;
  }
  return (
    <a
      href={stockSignalPath(stockSlug)}
      className={`text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
