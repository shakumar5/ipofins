import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Custom fallback UI. Defaults to a minimal retry card. */
  fallback?: React.ReactNode;
  /** Context label shown in the fallback message, e.g. "Smart Money Tracker" */
  label?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary — wraps React islands to catch render/hydration failures.
 *
 * Without this, a single component crash silently blanks the entire island.
 * With this, the user sees a retry option and the error is logged for monitoring.
 *
 * Usage in .astro files:
 *   <ErrorBoundary client:load label="Smart Money Tracker">
 *     <SmartMoneyPage client:load ... />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to monitoring (Sentry will pick this up once integrated)
    console.error(`[IPOFins ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ''}]`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="p-4 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 text-sm text-surface-500 dark:text-surface-400 flex flex-col items-start gap-2">
          <p>
            {this.props.label
              ? `${this.props.label} is temporarily unavailable.`
              : 'This section is temporarily unavailable.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="text-primary-600 dark:text-primary-400 hover:underline text-xs font-medium"
            type="button"
          >
            Try again →
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
