/**
 * Bidirectional merge of Zerodha + Groww IPO records.
 * Missing fields on either side are filled from the other source.
 */

import { fuzzyMatch, strictMatch, slugify, coalesce, parseDateToISO, ipoCanonicalKey } from './ipo-utils.mjs';
import { mergeGrowwDetailInto } from './groww-sources.mjs';

const STATUS_RANK = { live: 5, open: 4, upcoming: 3, closed: 2, allotment: 2, listed: 1, 'drhp-filed': 0 };

function blankIPO() {
  return {
    name: '',
    slug: '',
    type: 'mainboard',
    status: 'upcoming',
    priceRange: '',
    priceMin: null,
    priceMax: null,
    lotSize: null,
    issueSize: null,
    openDate: null,
    closeDate: null,
    allotmentDate: null,
    listingDate: null,
    sector: null,
    description: null,
    purpose: null,
    highlights: [],
    risks: [],
    drhpUrl: null,
    registrar: null,
    founders: null,
    headquarters: null,
    founded: null,
    listingPrice: null,
    subscription: null,
    subscriptionDetails: null,
    growwSlug: null,
    detailUrl: null,
    riskScore: 5,
    sources: [],
  };
}

function growwSlugToCanonical(searchId) {
  if (!searchId) return null;
  return searchId.replace(/-ipo$/, '');
}

function findExisting(list, record) {
  if (record.slug) {
    const bySlug = list.find((r) => r.slug === record.slug);
    if (bySlug) return bySlug;
  }
  if (record.growwSlug) {
    const gSlug = growwSlugToCanonical(record.growwSlug);
    const byGroww = list.find(
      (r) => r.growwSlug === record.growwSlug || r.slug === gSlug
    );
    if (byGroww) return byGroww;
  }
  const key = ipoCanonicalKey(record.name);
  if (key) {
    const byKey = list.find((r) => ipoCanonicalKey(r.name) === key);
    if (byKey) return byKey;
  }
  return list.find((r) => strictMatch(r.name, record.name));
}

function mergeField(target, source, field) {
  const t = target[field];
  const s = source[field];
  if (s === undefined || s === null || s === '') return;
  if (Array.isArray(s) && s.length === 0) return;

  if (Array.isArray(s)) {
    if (!t || t.length === 0) target[field] = s;
    else if (field === 'highlights' || field === 'risks') {
      // Prefer longer/richer list
      const tLen = (t || []).join('').length;
      const sLen = s.join('').length;
      if (sLen > tLen) target[field] = s;
    }
    return;
  }

  if (!t || t === 'Others' || t === 0) {
    target[field] = s;
  }
}

function mergeRecord(target, source) {
  if (!source) return target;

  const fields = [
    'name',
    'slug',
    'type',
    'priceRange',
    'priceMin',
    'priceMax',
    'lotSize',
    'issueSize',
    'openDate',
    'closeDate',
    'allotmentDate',
    'listingDate',
    'sector',
    'description',
    'purpose',
    'highlights',
    'risks',
    'drhpUrl',
    'registrar',
    'founders',
    'headquarters',
    'founded',
    'listingPrice',
    'subscription',
    'growwSlug',
    'detailUrl',
    'riskScore',
  ];

  for (const f of fields) mergeField(target, source, f);

  // DRHP: never keep zerodha.com links
  if (target.drhpUrl?.includes('zerodha.com') && source.drhpUrl && !source.drhpUrl.includes('zerodha.com')) {
    target.drhpUrl = source.drhpUrl;
  }

  // Status: prefer more "active" status when both agree it's the same IPO
  if (source.status && target.status) {
    const tr = STATUS_RANK[target.status] ?? 0;
    const sr = STATUS_RANK[source.status] ?? 0;
    if (sr > tr) target.status = source.status;
  } else if (source.status && !target.status) {
    target.status = source.status;
  }

  // Slug: keep target unless source has Zerodha URL slug for same company
  if (
    source.detailUrl &&
    source.slug &&
    strictMatch(target.name, source.name) &&
    !target.detailUrl
  ) {
    target.slug = source.slug;
  } else if (!target.slug && source.slug) {
    target.slug = source.slug;
  }

  if (source.subscriptionDetails && !target.subscriptionDetails) {
    target.subscriptionDetails = source.subscriptionDetails;
  }

  if (source.source && !target.sources.includes(source.source)) {
    target.sources.push(source.source);
  }

  return target;
}

function addOrMerge(list, record) {
  const existing = findExisting(list, record);
  if (!existing) {
    const ipo = { ...blankIPO(), ...record, sources: [record.source || 'unknown'] };
    if (!ipo.slug) ipo.slug = slugify(ipo.name);
    list.push(ipo);
    return;
  }
  mergeRecord(existing, record);
}

/**
 * Merge Zerodha listing buckets + Groww listing buckets into one deduplicated list.
 */
export function mergeBrokerListings(zerodha, groww) {
  const merged = [];

  const zAll = [
    ...(zerodha.live || []),
    ...(zerodha.upcoming || []),
    ...(zerodha.closed || []),
  ];
  const gAll = [
    ...(groww.open || []),
    ...(groww.upcoming || []),
    ...(groww.closed || []),
  ];

  for (const z of zAll) addOrMerge(merged, { ...z, source: 'zerodha' });
  for (const g of gAll) addOrMerge(merged, { ...g, source: 'groww' });

  const growwOpen = groww.open || [];
  // Re-merge open/live tabs for fresher subscription window fields
  for (const g of growwOpen) {
    const match = merged.find((m) => strictMatch(m.name, g.name));
    if (match) mergeRecord(match, g);
    else addOrMerge(merged, { ...g, source: 'groww' });
  }

  for (const z of zerodha.live || []) {
    const match = merged.find((m) => strictMatch(m.name, z.name) || m.slug === z.slug);
    if (match) mergeRecord(match, z);
    else addOrMerge(merged, { ...z, source: 'zerodha' });
  }

  console.log(`\n  🔀 Merged ${merged.length} unique IPOs (Zerodha + Groww)`);

  return merged;
}

export function mergeSubscriptionData(ipos, subData) {
  let updated = 0;
  for (const entry of subData) {
    const match = ipos.find((ipo) => fuzzyMatch(ipo.name, entry.name));
    if (!match) continue;
    match.subscription = coalesce(entry.total, match.subscription);
    match.subscriptionDetails = {
      retail: coalesce(entry.retail, match.subscriptionDetails?.retail),
      nii: coalesce(entry.nii, match.subscriptionDetails?.nii),
      qib: coalesce(entry.qib, match.subscriptionDetails?.qib),
      employee: coalesce(entry.employee, match.subscriptionDetails?.employee),
    };
    if (entry.growwSlug) match.growwSlug = entry.growwSlug;
    updated++;
  }
  console.log(`    ✅ Merged subscription for ${updated} IPOs`);
  return ipos;
}

/** Normalize dates to ISO for DB storage */
export function normalizeIPODates(ipos) {
  for (const ipo of ipos) {
    ipo.openDate = parseDateToISO(ipo.openDate);
    ipo.closeDate = parseDateToISO(ipo.closeDate);
    ipo.allotmentDate = parseDateToISO(ipo.allotmentDate);
    ipo.listingDate = parseDateToISO(ipo.listingDate);
  }
  return ipos;
}

export { mergeGrowwDetailInto };
