import type React from 'react';
import ErrorBoundary from './ErrorBoundary';

/** Wrap a React island with ErrorBoundary so render failures show a retry card. */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  label: string,
) {
  function Wrapped(props: P) {
    return (
      <ErrorBoundary label={label}>
        <Component {...props} />
      </ErrorBoundary>
    );
  }
  Wrapped.displayName = `WithErrorBoundary(${Component.displayName ?? Component.name ?? label})`;
  return Wrapped;
}
