/** Update document title and meta tags when switching tabs client-side. */
export function applyClientPageMeta(opts: {
  title: string;
  description: string;
  path?: string;
}) {
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
}
