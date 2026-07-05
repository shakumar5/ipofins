/** Report client-side errors to Sentry when the SDK is loaded (@sentry/astro). */
export function captureClientException(error: Error, context?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const sentry = (window as Window & {
    Sentry?: { captureException: (err: Error, opts?: { extra?: Record<string, unknown> }) => void };
  }).Sentry;
  if (sentry?.captureException) {
    sentry.captureException(error, context ? { extra: context } : undefined);
    return;
  }
  console.error('[IPOFins]', error, context);
}
