/**
 * IPO data access — reads from Neon at Astro build time.
 */

import { requireDb } from '../db';
import type { IPORecord, IPOStatus, IPOType, SubscriptionDetails } from '../../types/ipo';
import { ipoCanonicalKey, pickPreferredIPO } from '../ipo-canonical';
import { sanitizeIpoOptionalNumber, sanitizeIpoStringField } from '../ipo-list-sections';
import { withIpoScore } from '../ipo-score';
import { computeIpoRiskScore } from '../ipo-risk-factors';

/** Recompute the risk score from real evidence (DB stores a legacy count-based value). */
function withComputedRisk<T extends IPORecord>(ipo: T): T {
  return { ...ipo, riskScore: computeIpoRiskScore(ipo) };
}

function optNumber(val: unknown): number | null {
  return val != null ? Number(val) : null;
}

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
    priceRange: sanitizeIpoStringField(row.price_range) ?? '',
    priceMax: row.price_max != null ? Number(row.price_max) : undefined,
    lotSize: sanitizeIpoOptionalNumber(row.lot_size) ?? 0,
    issueSize: sanitizeIpoStringField(row.issue_size) ?? '',
    sector: sanitizeIpoStringField(row.sector) ?? '',
    openDate: sanitizeIpoStringField(formatDate(row.open_date)),
    closeDate: sanitizeIpoStringField(formatDate(row.close_date)),
    allotmentDate: sanitizeIpoStringField(formatDate(row.allotment_date)),
    listingDate: sanitizeIpoStringField(formatDate(row.listing_date)),
    description: sanitizeIpoStringField(row.description),
    purpose: sanitizeIpoStringField(row.purpose),
    highlights: Array.isArray(row.highlights) ? (row.highlights as string[]) : [],
    risks: Array.isArray(row.risks) ? (row.risks as string[]) : [],
    founders: sanitizeIpoStringField(row.founders),
    headquarters: sanitizeIpoStringField(row.headquarters),
    founded: sanitizeIpoStringField(row.founded),
    registrar: sanitizeIpoStringField(row.registrar),
    drhpUrl: row.drhp_url ? String(row.drhp_url) : undefined,
    subscription: row.total_times != null ? Number(row.total_times) : null,
    subscriptionDetails: sub,
    // GMP has been removed from the product (no authorized source); kept null for type compatibility.
    gmp: null,
    listingPrice: optNumber(row.listing_price),
    currentPrice: optNumber(row.current_price),
    price1w: optNumber(row.price_1w),
    price1m: optNumber(row.price_1m),
    price3m: optNumber(row.price_3m),
    price6m: optNumber(row.price_6m),
    price1y: optNumber(row.price_1y),
    return1mPct: optNumber(row.return_1m_pct),
    return1yPct: optNumber(row.return_1y_pct),
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
        p.listing_price, p.listing_gain_pct, p.current_price,
        p.price_1w, p.price_1m, p.price_3m, p.price_6m, p.price_1y,
        p.return_1m_pct, p.return_1y_pct
      FROM ipos i
      LEFT JOIN LATERAL (
        SELECT total_times, retail_times, nii_times, qib_times
        FROM ipo_subscriptions WHERE ipo_id = i.id ORDER BY date DESC LIMIT 1
      ) s ON true
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
      p.listing_price, p.listing_gain_pct, p.current_price,
      p.price_1w, p.price_1m, p.price_3m, p.price_6m, p.price_1y,
      p.return_1m_pct, p.return_1y_pct
    FROM ipos i
    LEFT JOIN LATERAL (
      SELECT total_times, retail_times, nii_times, qib_times
      FROM ipo_subscriptions WHERE ipo_id = i.id ORDER BY date DESC LIMIT 1
    ) s ON true
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
    allIPOsCache = queryIPOs().then((rows) =>
      dedupeIPORecords(rows.map(mapIPORow)).map(withComputedRisk).map(withIpoScore),
    );
  }
  return allIPOsCache;
}

export async function getIPOBySlug(slug: string): Promise<IPORecord | null> {
  const all = await getAllIPOs();
  const direct = all.find((i) => i.slug === slug);
  if (direct) return direct;

  const rows = await queryIPOs({ slug });
  if (rows.length === 0) return null;
  const candidate = withIpoScore(withComputedRisk(mapIPORow(rows[0])));
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
