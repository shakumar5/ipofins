import { useCallback, useState } from 'react';
import { saveCalculation } from '../../lib/local-dashboard';
import { withErrorBoundary } from '../withErrorBoundary';

interface Props {
  tool: string;
  summary: string;
  url?: string;
}

function SaveToDashboardButtonInner({ tool, summary, url }: Props) {
  const [saved, setSaved] = useState(false);

  const onSave = useCallback(() => {
    saveCalculation({
      tool,
      summary,
      url: url ?? (typeof window !== 'undefined' ? window.location.href : undefined),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [tool, summary, url]);

  return (
    <button
      type="button"
      onClick={onSave}
      className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
      aria-label={`Save ${tool} result to dashboard`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
      {saved ? 'Saved!' : 'Save to Dashboard'}
    </button>
  );
}

export default withErrorBoundary(SaveToDashboardButtonInner, 'Save to Dashboard');
