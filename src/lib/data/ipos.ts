/**
 * IPO data access — reads from Neon at Astro build time.
 */

import { requireDb } from '../db';
import type { IPORecord, IPOStatus, IPOType, SubscriptionDetails } from '../../types/ipo';
import { ipoCanonicalKey, pickPreferredIPO } from '../ipo-canonical';

type IPORow = Record<string, unknown>;

function formatDate(val: unknown): string | undefined {
  if (!val) return undefined;
  const d = new Date(val as string);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mapIPORow(row: IPORow): IPORecord {
  const sub: SubscriptionDetails = {
    retail: row.retail_times != null ? Number(row.retail_times) : null,
    nii: row.nii_times != null ? Number(row.nii_times) : null,
    qib: row.qib_times != null ? Number(row.qib_times) : null,
    employee: null,
  };

  return {
    name: String(row.name),
    slug: String(row.slug),
    type: (row.type as IPOType) || 'mainboard',
    status: (row.status as IPOStatus) || 'upcoming',
    priceRange: String(row.price_range || ''),
    priceMax: row.price_max != null ? Number(row.price_max) : undefined,
    lotSize: row.lot_size != null ? Number(row.lot_size) : 0,
    issueSize: String(row.issue_size || ''),
    sector: String(row.sector || ''),
    openDate: formatDate(row.open_date),
    closeDate: formatDate(row.close_date),
    allotmentDate: formatDate(row.allotment_date),
    listingDate: formatDate(row.listing_date),
    description: row.description ? String(row.description) : undefined,
    purpose: row.purpose ? String(row.purpose) : undefined,
    highlights: Array.isArray(row.highlights) ? (row.highlights as string[]) : [],
    risks: Array.isArray(row.risks) ? (row.risks as string[]) : [],
    founders: row.founders ? String(row.founders) : undefined,
    headquarters: row.headquarters ? String(row.headquarters) : undefined,
    founded: row.founded ? String(row.founded) : undefined,
    registrar: row.registrar ? String(row.registrar) : undefined,
    drhpUrl: row.drhp_url ? String(row.drhp_url) : undefined,
    subscription: row.total_times != null ? Number(row.total_times) : null,
    subscriptionDetails: sub,
    gmp: row.gmp != null ? Number(row.gmp) : null,
    listingPrice: row.listing_price != null ? Number(row.listing_price) : null,
    riskScore: row.risk_score != null ? Number(row.risk_score) : 5,
    aiScore: null,
    aiSummary: null,
    verdict: null,
    lastUpdated: row.last_updated ? String(row.last_updated) : undefined,
  };
}

async function queryIPOs(whereClause?: { slug: string }) {
  const sql = requireDb();

  if (whereClause) {
    const rows = await sql`
      SELECT
        i.*,
        s.total_times, s.retail_times, s.nii_times, s.qib_times,
        g.gmp,
        p.listing_price, p.listing_gain_pct
      FROM ipos i
      LEFT JOIN LATERAL (
        SELECT total_times, retail_times, nii_times, qib_times
        FROM ipo_subscriptions WHERE ipo_id = i.id ORDER BY date DESC LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT gmp FROM ipo_gmp_history WHERE ipo_id = i.id ORDER BY date DESC LIMIT 1
      ) g ON true
      LEFT JOIN ipo_performance p ON p.ipo_id = i.id
      WHERE i.slug = ${whereClause.slug}
      LIMIT 1
    `;
    return rows as IPORow[];
  }

  const rows = await sql`
    SELECT
      i.*,
      s.total_times, s.retail_times, s.nii_times, s.qib_times,
      g.gmp,
      p.listing_price, p.listing_gain_pct
    FROM ipos i
    LEFT JOIN LATERAL (
      SELECT total_times, retail_times, nii_times, qib_times
      FROM ipo_subscriptions WHERE ipo_id = i.id ORDER BY date DESC LIMIT 1
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT gmp FROM ipo_gmp_history WHERE ipo_id = i.id ORDER BY date DESC LIMIT 1
    ) g ON true
    LEFT JOIN ipo_performance p ON p.ipo_id = i.id
    ORDER BY
      CASE i.status
        WHEN 'live' THEN 1 WHEN 'open' THEN 2 WHEN 'upcoming' THEN 3
        WHEN 'closed' THEN 4 WHEN 'allotment' THEN 5 ELSE 6
      END,
      i.close_date DESC NULLS LAST
  `;
  return rows as IPORow[];
}

function dedupeIPORecords(records: IPORecord[]): IPORecord[] {
  const byKey = new Map<string, IPORecord>();
  for (const ipo of records) {
    const key = ipoCanonicalKey(ipo.name);
    const existing = byKey.get(key);
    byKey.set(key, existing ? pickPreferredIPO(existing, ipo) : ipo);
  }
  return [...byKey.values()];
}

let allIPOsCache: Promise<IPORecord[]> | null = null;

export async function getAllIPOs(): Promise<IPORecord[]> {
  if (!allIPOsCache) {
    allIPOsCache = queryIPOs().then((rows) => dedupeIPORecords(rows.map(mapIPORow)));
  }
  return allIPOsCache;
}

export async function getIPOBySlug(slug: string): Promise<IPORecord | null> {
  const all = await getAllIPOs();
  const direct = all.find((i) => i.slug === slug);
  if (direct) return direct;

  const rows = await queryIPOs({ slug });
  if (rows.length === 0) return null;
  const candidate = mapIPORow(rows[0]);
  const key = ipoCanonicalKey(candidate.name);
  return all.find((i) => ipoCanonicalKey(i.name) === key) ?? candidate;
}

export async function getUpcomingIPOs(): Promise<IPORecord[]> {
  const all = await getAllIPOs();
  return all.filter((i) => ['upcoming', 'drhp-filed', 'open'].includes(i.status));
}

export async function getIPOPerformance(): Promise<
  Array<{ slug: string; name: string; listingGainPct: number | null; listingPrice: number | null }>
> {
  const sql = requireDb();
  const rows = await sql`
    SELECT i.slug, i.name, p.listing_gain_pct, p.listing_price, i.listing_date
    FROM ipo_performance p
    JOIN ipos i ON i.id = p.ipo_id
    ORDER BY i.listing_date DESC NULLS LAST
  `;
  return (rows as IPORow[]).map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    listingGainPct: r.listing_gain_pct != null ? Number(r.listing_gain_pct) : null,
    listingPrice: r.listing_price != null ? Number(r.listing_price) : null,
  }));
}
