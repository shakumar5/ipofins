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
    return new Date(Number(s)).toISOString().slice(0, 10);
  }

  // "Jun 09, 2026" / "10 Jun 2026" / "10th Jun 2026"
  const ordinal = s.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const d = new Date(ordinal);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

export function tsToISO(ts) {
  if (!ts) return null;
  const n = Number(ts);
  if (!n || Number.isNaN(n)) return null;
  return new Date(n).toISOString().slice(0, 10);
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
