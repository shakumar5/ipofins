/**
 * Real-user Core Web Vitals → GA4 (after cookie consent).
 * web-vitals is dynamically imported so it does not block first paint.
 */
type Metric = {
  name: string;
  id: string;
  value: number;
  delta: number;
  rating: string;
};

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    __startWebVitals?: () => void;
    __markAnalyticsReady?: () => void;
    __webVitalsPending?: boolean;
    __analyticsReadyPending?: boolean;
    __runWebVitals?: () => void;
    __flushAnalyticsReady?: () => void;
  }
}

let started = false;
let analyticsReady = false;
const pendingGa: Metric[] = [];

function metricValue(metric: Metric): number {
  return Math.round(metric.name === 'CLS' ? metric.delta * 1000 : metric.delta);
}

function sendToGoogleAnalytics(metric: Metric): void {
  if (typeof window.gtag !== 'function') {
    pendingGa.push(metric);
    return;
  }
  window.gtag('event', metric.name, {
    event_category: 'Web Vitals',
    event_label: metric.id,
    value: metricValue(metric),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    non_interaction: true,
  });
}

function reportMetric(metric: Metric): void {
  sendToGoogleAnalytics(metric);
}

function flushPending(): void {
  if (!analyticsReady) return;
  while (pendingGa.length) sendToGoogleAnalytics(pendingGa.shift()!);
}

/** Call from BaseLayout once the gtag script has initialized. */
export function markAnalyticsReady(): void {
  analyticsReady = true;
  flushPending();
}

/** Register CWV listeners (idempotent). Only call after cookie consent. */
export async function initWebVitalsReporting(): Promise<void> {
  if (started || typeof window === 'undefined') return;
  started = true;

  const { onCLS, onINP, onLCP, onFCP, onTTFB } = await import('web-vitals');
  const report = (metric: Metric) => reportMetric(metric);
  onCLS(report);
  onINP(report);
  onLCP(report);
  onFCP(report);
  onTTFB(report);
}

/** Exposed on window for inline consent / analytics bootstrap scripts. */
export function registerWebVitalsHooks(): void {
  window.__runWebVitals = () => {
    void initWebVitalsReporting();
  };
  window.__flushAnalyticsReady = () => {
    markAnalyticsReady();
  };
  window.__startWebVitals = () => {
    void initWebVitalsReporting();
  };
  window.__markAnalyticsReady = markAnalyticsReady;

  if (window.__webVitalsPending) void initWebVitalsReporting();
  if (window.__analyticsReadyPending) markAnalyticsReady();
}

registerWebVitalsHooks();
