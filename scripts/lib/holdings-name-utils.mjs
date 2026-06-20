/**
 * Normalize mutual-fund names/slugs from AMC portfolio disclosure files.
 */

/** Strip Samco monthly titles, ERSTWHILE parentheticals, and scheme boilerplate. */
export function normalizeDisclosureFundName(name) {
  let n = String(name || '').trim();
  if (!n) return n;

  n = n.replace(/^\[+/, '').replace(/\]+$/, '').trim();
  n = n.replace(/^monthly\s+/i, '');
  n = n.replace(/\s+as\s+on\s+[^()]+/gi, '');
  n = n.replace(/\s*\(erstwhile[^)]*\)/gi, '');
  n = n.replace(/\s*\(formerly[^)]*\)/gi, '');
  n = n.replace(/\s*\(former[^)]*\)/gi, '');
  n = n.replace(/\s*\([^)]*an\s+open[\s-]ended[^)]*\)/gi, '');
  n = n.replace(/\s*\([^)]*predominantly[^)]*\)/gi, '');
  n = n.replace(/\s+/g, ' ').trim();

  return n;
}

export function isGarbageDisclosureFund(name, slug = '') {
  const n = String(name || '').toLowerCase();
  const s = String(slug || '').toLowerCase();
  if (!n || n.length < 4) return true;
  if (/^pursuant\s+to\s+regulation/i.test(n)) return true;
  if (/securities\s+and\s+exchange\s+board/i.test(n) && /regulation/i.test(n)) return true;
  if (/^monthly\s+samco/i.test(n) && /as\s+on/i.test(n)) return true;
  if (/^monthly-samco-.+-as-on-/.test(s)) return true;
  return false;
}

/** Key for fuzzy name match between disclosure files and mutual-funds.json. */
export function disclosureMatchKey(name) {
  return normalizeDisclosureFundName(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bfund\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Slug variants for multi-cap/multicap, flexicap/flexi-cap, etc. */
export function collapseFundSlugVariants(slug) {
  const base = String(slug || '').trim();
  if (!base) return [];

  const variants = new Set([base]);
  const add = (s) => {
    if (s) variants.add(s);
  };

  const swaps = [
    [/flexicap/g, 'flexi-cap'],
    [/flexi-cap/g, 'flexicap'],
    [/multi-cap/g, 'multicap'],
    [/multicap/g, 'multi-cap'],
    [/large-mid-cap/g, 'large-midcap'],
    [/large-midcap/g, 'large-mid-cap'],
    [/large-midcap/g, 'large-and-midcap'],
    [/large-and-midcap/g, 'large-mid-cap'],
    [/smallcap/g, 'small-cap'],
    [/small-cap/g, 'smallcap'],
    [/largecap/g, 'large-cap'],
    [/large-cap/g, 'largecap'],
    [/midcap/g, 'mid-cap'],
    [/mid-cap/g, 'midcap'],
  ];

  for (const [from, to] of swaps) {
    if (from.test(base)) add(base.replace(from, to));
  }

  return [...variants];
}
