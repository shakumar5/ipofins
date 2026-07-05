import { useState, type FormEvent } from 'react';
import { withErrorBoundary } from '../withErrorBoundary';
import { DEFAULT_ALERT_TYPES, type IPOAlertEvent } from '../../lib/ipo-alerts';

interface Props {
  ipoSlug: string;
  ipoName: string;
}

const ALERT_LABELS: Record<IPOAlertEvent, string> = {
  open: 'IPO opens',
  reminder: 'Closing reminder',
  close: 'Subscription closes',
  allotment: 'Allotment day',
  listing: 'Listing day',
};

function IPOAlertSignupInner({ ipoSlug, ipoName }: Props) {
  const [email, setEmail] = useState('');
  const [types, setTypes] = useState<IPOAlertEvent[]>([...DEFAULT_ALERT_TYPES]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const toggleType = (event: IPOAlertEvent) => {
    setTypes((prev) =>
      prev.includes(event) ? prev.filter((t) => t !== event) : [...prev, event],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/ipo-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ipoSlug, alertTypes: types }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Could not subscribe. Please try again.');
        return;
      }
      setStatus('success');
      setMessage(data.message || `Alerts enabled for ${ipoName}.`);
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-lg border border-success-200 bg-success-50 dark:border-success-800/40 dark:bg-success-950/20 p-4">
        <p className="text-sm font-medium text-success-800 dark:text-success-200">{message}</p>
        <p className="text-xs text-success-700 dark:text-success-300 mt-1">
          Free alerts — no account needed. Unsubscribe link in every email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/40 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Get IPO email alerts</h3>
        <p className="text-xs text-surface-500 mt-0.5">
          Free notifications for {ipoName} — open, close, allotment & listing. No login required.
        </p>
      </div>

      <div>
        <label htmlFor={`alert-email-${ipoSlug}`} className="text-xs font-medium text-surface-700 dark:text-surface-300">
          Email address
        </label>
        <input
          id={`alert-email-${ipoSlug}`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm"
        />
      </div>

      <fieldset>
        <legend className="text-xs font-medium text-surface-700 dark:text-surface-300 mb-2">Alert me when</legend>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_ALERT_TYPES.map((event) => (
            <label
              key={event}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer border ${
                types.includes(event)
                  ? 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-950/30 dark:text-primary-200'
                  : 'border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-400'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={types.includes(event)}
                onChange={() => toggleType(event)}
              />
              {ALERT_LABELS[event]}
            </label>
          ))}
        </div>
      </fieldset>

      {message && status === 'error' && (
        <p className="text-xs text-danger-600 dark:text-danger-400" role="alert">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'loading' || types.length === 0}
        className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
      >
        {status === 'loading' ? 'Subscribing…' : 'Subscribe to alerts'}
      </button>

      <p className="text-[11px] text-surface-400 leading-relaxed">
        By subscribing you agree to receive transactional emails about this IPO only.
        Not investment advice. See our{' '}
        <a href="/privacy" className="underline hover:text-primary-600">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}

export default withErrorBoundary(IPOAlertSignupInner, 'IPO Alert Signup');
