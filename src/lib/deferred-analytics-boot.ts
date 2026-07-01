/** Vercel Analytics + web-vitals — loaded after cookie consent (Vite-bundled). */

declare global {
  interface Window {
    __vercelAnalyticsBooted?: boolean;
    __vercelAnalyticsScheduled?: boolean;
  }
}

function bootDeferredAnalytics(): void {
  if (window.__vercelAnalyticsBooted) return;
  window.__vercelAnalyticsBooted = true;
  void import('@vercel/analytics').then((m) => {
    if (m.inject) m.inject();
  });
  void import('./web-vitals-report');
}

function scheduleDeferredAnalytics(): void {
  if (window.__vercelAnalyticsScheduled) return;
  window.__vercelAnalyticsScheduled = true;
  const run = () => {
    setTimeout(bootDeferredAnalytics, 8000);
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 20000 });
  } else {
    setTimeout(run, 10000);
  }
}

export function initDeferredAnalytics(): void {
  if (localStorage.getItem('cookie-consent') === 'accepted') {
    scheduleDeferredAnalytics();
  }
  window.addEventListener('cookie-consent-accepted', scheduleDeferredAnalytics);
}
