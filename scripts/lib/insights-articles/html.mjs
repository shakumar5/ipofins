/** HTML helpers for generated Learn / insights articles (use .insights-article CSS). */

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function monthSlug(month) {
  return String(month).toLowerCase().replace(/\s+/g, '-');
}

export function readTimeFromWords(html) {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return `${Math.max(3, Math.ceil(words / 200))} min`;
}

export function stockSignalHref(slug) {
  return `/mutual-funds/smart-money/stock-signal/${slug}`;
}

export function signalDetailHref(slug) {
  return `/mutual-funds/smart-money/signal/${slug}`;
}

export function sectorHref(sectorSlug) {
  return `/mutual-funds/smart-money/sector-intelligence/${sectorSlug}`;
}

/** Link to the indexable hub only — pairwise URLs are not submitted to GSC. */
export function overlapHref(_slugA, _slugB) {
  return '/mutual-funds/portfolio-overlap-checker';
}

export function holdingsChangesHref(amcSlug, monthSlugValue) {
  return `/mutual-funds/mutual-fund-holdings-changes/${amcSlug}/${monthSlugValue}`;
}

export function articleLink(href, text) {
  return `<a href="${href}" class="ia-link">${text}</a>`;
}

export function ctaLink(href, text) {
  return `<a href="${href}" class="ia-cta">${text}</a>`;
}

export function articleLinkOrCta(href, text) {
  return String(text).includes('→') ? ctaLink(href, text) : articleLink(href, text);
}

export function stockLink(slug, name) {
  return articleLink(stockSignalHref(slug), escapeHtml(name));
}

export function pctChange(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const cls = n > 0 ? 'ia-num ia-num--up' : n < 0 ? 'ia-num ia-num--down' : 'ia-num';
  const sign = n > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${n.toFixed(2)}%</span>`;
}

export function moveBadge(move) {
  if (move === 'Fresh entry') return '<span class="ia-badge ia-badge--fresh">Fresh entry</span>';
  if (move === 'Increased') return '<span class="ia-badge ia-badge--increase">Increased</span>';
  return escapeHtml(move);
}

export function table(headers, rows) {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="ia-table-wrap data-table-premium"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function p(text) {
  return `<p class="ia-p">${text}</p>`;
}

export function h2(text) {
  return `<h2 class="ia-h2">${escapeHtml(text)}</h2>`;
}

export function h3(text) {
  return `<h3 class="ia-h3">${escapeHtml(text)}</h3>`;
}

export function ul(items) {
  return `<ul class="ia-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

export function ol(items) {
  return `<ol class="ia-list ia-list--ordered">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
}

export function disclaimer(month) {
  return `<div class="ia-footnote"><p class="ia-disclaimer"><em>Data source: SEBI-regulated AMC monthly portfolio disclosures for ${escapeHtml(month)}. Not investment advice. Past institutional activity does not guarantee future returns.</em></p></div>`;
}

export function keyTakeaway(text) {
  return `<div class="ia-takeaway" role="note"><p class="ia-takeaway__label"><span class="ia-takeaway__icon" aria-hidden="true"></span>Key takeaway</p><p class="ia-takeaway__body">${text}</p></div>`;
}

export function glossary(items) {
  if (!items?.length) return '';
  const cards = items
    .map(
      ({ term, def }) =>
        `<div class="ia-glossary__item"><p class="ia-glossary__term">${escapeHtml(term)}</p><p class="ia-glossary__def">${def}</p></div>`,
    )
    .join('');
  return `${h2('Terms explained')}<div class="ia-glossary"><div class="ia-glossary__grid">${cards}</div></div>`;
}

export function detailBlock(title, bodyHtml) {
  return `<div class="ia-spotlight"><h3 class="ia-spotlight__title">${escapeHtml(title)}</h3><div class="ia-spotlight__body">${bodyHtml}</div></div>`;
}
