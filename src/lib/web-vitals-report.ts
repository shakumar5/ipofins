/**
 * Real-user Core Web Vitals → GA4 + Plausible (after cookie consent).
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
type PlausibleFn = (event: string, options?: { props?: Record<string, string | number> }) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    plausible?: PlausibleFn;
    __startWebVitals?: () => void;
    __markAnalyticsReady?: () => void;
  }
}

let started = false;
let analyticsReady = false;
const pendingGa: Metric[] = [];
const pendingPlausible: Metric[] = [];

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

function sendToPlausible(metric: Metric): void {
  if (typeof window.plausible !== 'function') {
    pendingPlausible.push(metric);
    return;
  }
  window.plausible('Web Vitals', {
    props: {
      name: metric.name,
      value: String(metricValue(metric)),
      rating: metric.rating,
    },
  });
}

function reportMetric(metric: Metric): void {
  sendToGoogleAnalytics(metric);
  sendToPlausible(metric);
}

function flushPending(): void {
  if (!analyticsReady) return;
  while (pendingGa.length) sendToGoogleAnalytics(pendingGa.shift()!);
  while (pendingPlausible.length) sendToPlausible(pendingPlausible.shift()!);
}

/** Call from BaseLayout once gtag + Plausible scripts have initialized. */
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
  window.__startWebVitals = () => {
    void initWebVitalsReporting();
  };
  window.__markAnalyticsReady = markAnalyticsReady;
}

registerWebVitalsHooks();
