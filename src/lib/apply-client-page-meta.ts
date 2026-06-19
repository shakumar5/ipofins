import type { PageMeta } from './page-meta';

/** Update document title, meta tags, and on-page heading when switching tabs client-side. */
export function applyClientPageMeta(opts: PageMeta) {
  if (typeof document === 'undefined') return;

  document.title = opts.title;

  const setMeta = (selector: string, content: string) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute('content', content);
  };

  setMeta('meta[name="description"]', opts.description);
  setMeta('meta[property="og:title"]', opts.title);
  setMeta('meta[property="og:description"]', opts.description);
  setMeta('meta[name="twitter:title"]', opts.title);
  setMeta('meta[name="twitter:description"]', opts.description);

  if (opts.path) {
    const canonical = `${window.location.origin}${opts.path}`;
    setMeta('meta[property="og:url"]', canonical);
    const link = document.querySelector('link[rel="canonical"]');
    if (link) link.setAttribute('href', canonical);
  }

  if (opts.heading) {
    const heading = document.querySelector('[data-page-heading]');
    if (heading) heading.textContent = opts.heading;
  }

  if (opts.subtitle) {
    const subtitle = document.querySelector('[data-page-subtitle]');
    if (subtitle) subtitle.textContent = opts.subtitle;
  }

  if (opts.breadcrumbLabel) {
    const crumb = document.querySelector('[data-breadcrumb-leaf]');
    if (crumb) crumb.textContent = opts.breadcrumbLabel;
  }
}
