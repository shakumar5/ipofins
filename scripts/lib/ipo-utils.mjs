/** Shared helpers for Zerodha/Groww IPO pipelines */

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

/** Normalize IPO company name for deduplication (Zerodha vs Groww naming). */
export function ipoCanonicalKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*(limited|ltd|\.|ipo|india|pvt|private|company|technologies|industries|corporation|corp)\s*/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

export function fuzzyMatch(name1, name2) {
  const n1 = ipoCanonicalKey(name1);
  const n2 = ipoCanonicalKey(name2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  if (n1.length >= 8 && n2.length >= 8 && (n1.includes(n2) || n2.includes(n1))) return true;
  if (n1.length >= 10 && n2.length >= 10 && n1.slice(0, 10) === n2.slice(0, 10)) return true;
  return false;
}

/** Stricter match for deduplication — avoids merging different companies */
export function strictMatch(name1, name2) {
  const n1 = ipoCanonicalKey(name1);
  const n2 = ipoCanonicalKey(name2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  const short = n1.length < n2.length ? n1 : n2;
  const long = n1.length < n2.length ? n2 : n1;
  if (short.length >= 10 && long.startsWith(short)) return true;
  return false;
}

export function findByName(list, name) {
  return list.find((item) => fuzzyMatch(item.name, name));
}

export async function fetchHTML(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Normalize assorted date strings to YYYY-MM-DD for Postgres DATE columns */
export function parseDateToISO(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // Epoch ms
  if (/^\d{13}$/.test(s)) {
    return formatLocalDate(new Date(Number(s)));
  }

  // "Jun 09, 2026" / "10 Jun 2026" / "10th Jun 2026"
  const ordinal = s.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const d = new Date(ordinal);
  if (!isNaN(d.getTime())) return formatLocalDate(d);

  return null;
}

export function tsToISO(ts) {
  if (!ts) return null;
  const n = Number(ts);
  if (!n || Number.isNaN(n)) return null;
  return formatLocalDate(new Date(n));
}

export function coalesce(...vals) {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && isIpoPlaceholder(v)) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'number' && v === 0) continue;
    return v;
  }
  return null;
}

const IPO_PLACEHOLDER_RE =
  /^(&ndash;|&mdash;|&#0*8211;|&#0*8212;|n\/a|na|tba|not available|not disclosed|pending|—|–|-|\.)$/i;

export function decodeIpoHtmlEntities(text) {
  return String(text || '')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&#0*8211;/g, '–')
    .replace(/&#0*8212;/g, '—')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

export function isIpoPlaceholder(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !Number.isFinite(value) || value === 0;
  const s = decodeIpoHtmlEntities(value).trim();
  if (!s) return true;
  if (IPO_PLACEHOLDER_RE.test(s)) return true;
  if (/^[–—\-\s.&]+$/u.test(s)) return true;
  return false;
}

export function sanitizeIpoText(value) {
  if (isIpoPlaceholder(value)) return null;
  return decodeIpoHtmlEntities(value);
}

export function formatIssueSizeCr(rupees) {
  if (!rupees) return null;
  const n = Number(rupees);
  if (!n || Number.isNaN(n)) return null;
  const crores = Math.round((n / 1e7) * 100) / 100;
  return `₹${crores} Cr`;
}

export function parsePriceRange(priceRange) {
  if (!priceRange) return { min: null, max: null };
  const match = String(priceRange).match(/([\d,.]+)\s*[-–to]+\s*([\d,.]+)/i);
  if (match) {
    return {
      min: parseFloat(match[1].replace(/,/g, '')),
      max: parseFloat(match[2].replace(/,/g, '')),
    };
  }
  const single = parseFloat(String(priceRange).replace(/[^\d.]/g, ''));
  return { min: single || null, max: single || null };
}

function looksLikeDateFragmentPrice(min, max) {
  const lo = min != null ? Number(min) : null;
  const hi = max != null ? Number(max) : lo;
  if (hi == null || !Number.isFinite(hi)) return false;

  // Scraped date fragments like "29 Jun 2026" can leak through as "29-2026".
  // Reject day-year pairs and lone 20xx values so merge logic can fall back
  // to the correct broker source instead of persisting a fake issue price.
  const hiLooksLikeYear = hi >= 2000 && hi <= 2100 && Number.isInteger(hi);
  const loLooksLikeDay = lo != null && lo >= 1 && lo <= 31 && Number.isInteger(lo);
  const loneYearLike = lo != null && lo === hi && hiLooksLikeYear;
  return hiLooksLikeYear && (loLooksLikeDay || loneYearLike);
}

/** Reject date fragments and other scrape junk masquerading as IPO prices. */
export function isPlausibleIpoPriceBand(min, max, type = 'mainboard') {
  const hi = max != null ? Number(max) : min != null ? Number(min) : null;
  const lo = min != null ? Number(min) : null;
  const floor = type === 'sme' ? 12 : 30;
  if (hi == null || !Number.isFinite(hi) || hi < floor) return false;
  if (lo != null && Number.isFinite(lo) && lo > hi) return false;
  if (lo != null && Number.isFinite(lo) && lo < Math.max(5, floor * 0.25)) return false;
  if (looksLikeDateFragmentPrice(lo, hi)) return false;
  return true;
}

/** Lot sizes below 15 are usually day-of-month parse errors (e.g. "10 Jul"). */
export function isPlausibleIpoLotSize(lot, type = 'mainboard') {
  const n = Number(lot);
  if (!Number.isFinite(n) || n < 15) return false;
  if (type === 'sme' && n > 2500) return false;
  if (type === 'mainboard' && n > 1200) return false;
  return true;
}

export function parseLotSizeFromHtmlValue(raw) {
  const text = String(raw || '')
    .replace(/<[^>]+>/g, '')
    .trim();
  const shareMatch = text.match(/(\d[\d,]*)\s*shares?\b/i);
  if (shareMatch) {
    const n = parseInt(shareMatch[1].replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d[\d,]*$/.test(text)) {
    const n = parseInt(text.replace(/,/g, ''), 10);
    return n >= 15 ? n : null;
  }
  return null;
}

export function resolveIpoPriceFields(ipo, existing = null) {
  const type = ipo.type || existing?.type || 'mainboard';
  const incoming = {
    min: ipo.priceMin ?? parsePriceRange(ipo.priceRange).min,
    max: ipo.priceMax ?? parsePriceRange(ipo.priceRange).max,
    range: ipo.priceRange || null,
  };
  const current = existing
    ? {
        min: existing.price_min != null ? Number(existing.price_min) : null,
        max: existing.price_max != null ? Number(existing.price_max) : null,
        range: existing.price_range || null,
      }
    : { min: null, max: null, range: null };

  const incomingOk = isPlausibleIpoPriceBand(incoming.min, incoming.max, type);
  const currentOk = isPlausibleIpoPriceBand(current.min, current.max, type);
  const pick = incomingOk ? incoming : currentOk ? current : incoming.range || current.range ? incoming : current;

  let range = pick.range;
  if (!range && pick.min != null && pick.max != null) {
    range = pick.min === pick.max ? String(pick.max) : `${pick.min}-${pick.max}`;
  }

  return { min: pick.min, max: pick.max, range: range || null };
}

export function resolveIpoLotSize(incomingLot, existingLot, type = 'mainboard') {
  const inOk = isPlausibleIpoLotSize(incomingLot, type);
  const curOk = isPlausibleIpoLotSize(existingLot, type);
  if (inOk) return Number(incomingLot);
  if (curOk) return Number(existingLot);
  return inOk ? Number(incomingLot) : curOk ? Number(existingLot) : incomingLot ?? existingLot ?? null;
}

export function pickPreferredSlug(a, b) {
  const slugs = [a, b].filter(Boolean);
  if (slugs.length <= 1) return slugs[0] ?? a;
  const noCompany = slugs.find((s) => !s.includes('-company'));
  if (noCompany) return noCompany;
  return [...slugs].sort((x, y) => x.length - y.length)[0];
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
