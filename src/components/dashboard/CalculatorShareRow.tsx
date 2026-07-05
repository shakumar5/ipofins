import { useCallback, useState } from 'react';
import SaveToDashboardButton from './SaveToDashboardButton';
import { withErrorBoundary } from '../withErrorBoundary';

interface Props {
  tool: string;
  summary: string;
  shareText: string;
  url?: string;
}

function CalculatorShareRowInner({ tool, summary, shareText, url }: Props) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url ?? (typeof window !== 'undefined' ? window.location.href : '');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [shareUrl]);

  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
        aria-label={`Share ${tool} result on WhatsApp`}
      >
        Share on WhatsApp
      </a>
      <SaveToDashboardButton tool={tool} summary={summary} url={shareUrl} />
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
        aria-label="Copy link to this calculation"
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}

export default withErrorBoundary(CalculatorShareRowInner, 'Calculator Share');
