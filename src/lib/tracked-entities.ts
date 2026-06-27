/**
 * Tracked Entities — Super Investors + 1% Club (v1)
 *
 *   /super-investors    curated roster (30) + quarterly holdings
 *   /1-percent-club     raw ≥1% holders per stock + name search
 */

import superInvestorsJson from '../data/super-investors.json';
import { sql } from './db';
import { BRAND_URL } from './brand';
import { dedupeHoldingsByStock, stockListingKey, stockListingKeySql } from './holdings-dedupe';

/** SQL fragment for GROUP BY / joins on stocks — must match stock-listing-key.ts */
const STOCK_LISTING_KEY = stockListingKeySql('s');

// ─── Types ────────────────────────────────────────────────────────

export type EntityType =
  | 'individual'
  | 'family_office'
  | 'fii'
  | 'dii';

export interface StrategySeed {
  name: string;
  strategyType?: string | null;
  minTicketCr?: number | null;
  description?: string | null;
}

interface EntitySeedBase {
  name: string;
  displayName?: string;
  type?: EntityType;
  tier?: string | null;
  aliases?: string[];
  focus?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  tags?: string[];
  parentOrg?: string | null;
  registrationId?: string | null;
  strategies?: StrategySeed[];
}

export interface Entity extends EntitySeedBase {
  slug: string;
  displayName: string;
  type: EntityType;
  tier: string | null;
  aliases: string[];
  tags: string[];
  strategies: StrategySeed[];
}

/** Live stats joined from migration 005 materialized views (nullable). */
export interface EntityLiveStats {
  quarter: string | null;
  totalHoldings: number | null;
  portfolioValueCr: number | null;
  top5Concentration: number | null;
  largeCapPct: number | null;
  midCapPct: number | null;
  smallCapPct: number | null;
  freshEntries: number | null;
  exits: number | null;
  adds: number | null;
  trims: number | null;
}

// Untyped-as-any row shapes returned by @neondatabase/serverless tagged
// templates (its union return type doesn't carry column types).
interface EntityStatsRow {
  slug: string;
  quarter: string | null;
  total_holdings: number | null;
  portfolio_value_cr: number | null;
  top5_concentration: number | null;
  large_cap_pct: number | null;
  mid_cap_pct: number | null;
  small_cap_pct: number | null;
  fresh_entries: number | null;
  exits: number | null;
  adds: number | null;
  trims: number | null;
}

interface SnapshotRow {
  stocks_held: number | null;
  total_value_cr: number | null;
  latest_quarter: string | null;
}

// ─── Slug helper (must match db/seed/seed-super-investors.mjs) ────

export function slugifyEntity(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

/** Collapse filing-name variants for 1% Club holder search (case, spacing, trailing dots). */
export function normalizeHolderSearchKey(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(seed: EntitySeedBase, fallbackType: EntityType): Entity {
  return {
    slug: slugifyEntity(seed.name),
    name: seed.name,
    displayName: seed.displayName || seed.name,
    type: seed.type || fallbackType,
    tier: seed.tier ?? null,
    aliases: Array.isArray(seed.aliases) ? seed.aliases : [],
    focus: seed.focus ?? null,
    bio: seed.bio ?? null,
    location: seed.location ?? null,
    website: seed.website ?? null,
    tags: Array.isArray(seed.tags) ? seed.tags : [],
    parentOrg: seed.parentOrg ?? null,
    registrationId: seed.registrationId ?? null,
    strategies: Array.isArray(seed.strategies) ? seed.strategies : [],
  };
}

// ─── Roster accessors ────────────────────────────────────────────

export function getSuperInvestors(): Entity[] {
  return (superInvestorsJson as EntitySeedBase[]).map((s) => normalize(s, s.type ?? 'individual'));
}

export const SUPER_INVESTOR_TYPES: EntityType[] = ['individual', 'family_office', 'fii', 'dii'];

export function getAllTrackedEntities(): Entity[] {
  return getSuperInvestors();
}

export function findEntityBySlug(slug: string): Entity | undefined {
  return getSuperInvestors().find((e) => e.slug === slug);
}

export function findSuperInvestorBySlug(slug: string): Entity | undefined {
  return findEntityBySlug(slug);
}

export interface CuratedSearchOption {
  name: string;
  slug: string;
}

/** Display names + aliases for the Individual Investors hub search. */
export function getCuratedInvestorSearchOptions(entities: Entity[]): CuratedSearchOption[] {
  const seen = new Set<string>();
  const out: CuratedSearchOption[] = [];
  for (const e of entities) {
    const names = new Set([e.displayName, e.name, ...e.aliases]);
    for (const name of names) {
      const key = `${e.slug}:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, slug: e.slug });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Tier metadata (display labels + ordering) ───────────────────

const TIER_ORDER: Record<string, number> = { legendary: 0, active: 1, emerging: 2 };

export function tierRank(tier: string | null): number {
  return TIER_ORDER[tier ?? ''] ?? 99;
}

export function tierLabel(tier: string | null): string {
  switch (tier) {
    case 'legendary':
      return 'Legendary';
    case 'active':
      return 'Active';
    case 'emerging':
      return 'Emerging';
    default:
      return 'Tracked';
  }
}

export function typeLabel(type: EntityType): string {
  switch (type) {
    case 'individual':
      return 'Individual Investor';
    case 'family_office':
      return 'Family Office';
    case 'fii':
      return 'FII';
    case 'dii':
      return 'DII';
    default:
      return type;
  }
}

export interface EntityHoldingRow {
  stockName: string;
  stockSlug: string;
  nseSymbol: string | null;
  shares: number | null;
  pctOfCompany: number | null;
  marketValueCr: number | null;
  changeType: string | null;
  pctChange: number | null;
  prevPct: number | null;
  quarter: string | null;
}

export interface EntityStockChangeRow {
  stockName: string;
  stockSlug: string;
  nseSymbol: string | null;
  isin?: string | null;
  bseCode?: string | null;
  changeType: string;
  prevPct: number | null;
  newPct: number | null;
  pctChange: number | null;
  marketValueCr: number | null;
  prevMarketValueCr: number | null;
}

/** NSE symbol when present, else stock slug — collapses duplicate stocks rows. */
export function stockCanonicalKey(nseSymbol: string | null | undefined, stockSlug: string): string {
  const sym = nseSymbol?.trim();
  return (sym || stockSlug).toLowerCase();
}

function dedupeStockChangeRows(rows: EntityStockChangeRow[]): EntityStockChangeRow[] {
  const byKey = new Map<string, EntityStockChangeRow>();
  for (const row of rows) {
    const key = stockListingKey(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const rowScore = Math.abs(row.pctChange ?? 0) * 1000 + (row.marketValueCr ?? 0);
    const prevScore = Math.abs(prev.pctChange ?? 0) * 1000 + (prev.marketValueCr ?? 0);
    if (rowScore >= prevScore) byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

export interface EntityQuarterChangeDetail {
  quarter: string;
  prevQuarter: string | null;
  rows: EntityStockChangeRow[];
}

/** Latest-quarter holdings for a curated super investor. */
export async function getEntityHoldings(entitySlug: string): Promise<EntityHoldingRow[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH te AS (
        SELECT id FROM tracked_entities WHERE slug = ${entitySlug}
      ),
      latest_eh AS (
        SELECT MAX(eh.quarter) AS q
        FROM entity_holdings eh
        JOIN te ON te.id = eh.entity_id
        WHERE eh.strategy_id IS NULL
      ),
      latest_sph AS (
        SELECT MAX(sph.quarter) AS q
        FROM shareholding_pattern_holders sph
        JOIN te ON te.id = sph.entity_id
        WHERE sph.is_promoter = FALSE AND sph.pct_of_company >= 1.0
      ),
      target_q AS (
        SELECT COALESCE((SELECT q FROM latest_eh), (SELECT q FROM latest_sph)) AS q
      ),
      eh_base AS (
        SELECT DISTINCT ON (eh.stock_id)
          eh.stock_id,
          eh.shares_held,
          eh.pct_of_company,
          eh.market_value_cr,
          eh.quarter
        FROM entity_holdings eh
        JOIN te ON te.id = eh.entity_id
        WHERE eh.strategy_id IS NULL
          AND eh.quarter = (SELECT q FROM target_q)
        ORDER BY eh.stock_id, eh.pct_of_company DESC NULLS LAST, eh.id DESC
      ),
      sph_base AS (
        SELECT
          sph.stock_id,
          SUM(sph.shares)::bigint AS shares_held,
          ROUND(SUM(sph.pct_of_company)::numeric, 3) AS pct_of_company,
          sph.quarter,
          NULL::numeric AS market_value_cr
        FROM shareholding_pattern_holders sph
        JOIN te ON te.id = sph.entity_id
        WHERE sph.is_promoter = FALSE
          AND sph.pct_of_company >= 1.0
          AND COALESCE(sph.match_confidence, 0) >= 0.85
          AND sph.quarter = (SELECT q FROM target_q)
        GROUP BY sph.stock_id, sph.quarter
      ),
      base AS (
        SELECT
          (array_agg(ps.stock_id ORDER BY ps.stock_id))[1] AS stock_id,
          MAX(ps.shares_held) AS shares_held,
          MAX(ps.pct_of_company) AS pct_of_company,
          MAX(ps.quarter) AS quarter,
          MAX(ps.market_value_cr) AS market_value_cr
        FROM (
          SELECT
            COALESCE(eh.stock_id, sph.stock_id) AS stock_id,
            COALESCE(eh.shares_held, sph.shares_held) AS shares_held,
            COALESCE(eh.pct_of_company, sph.pct_of_company) AS pct_of_company,
            COALESCE(eh.quarter, sph.quarter) AS quarter,
            eh.market_value_cr
          FROM eh_base eh
          FULL OUTER JOIN sph_base sph ON eh.stock_id = sph.stock_id
        ) ps
        JOIN stocks s ON s.id = ps.stock_id
        GROUP BY COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)
      ),
      valued AS (
        SELECT
          b.stock_id,
          b.shares_held,
          b.pct_of_company,
          b.quarter,
          COALESCE(
            b.market_value_cr,
            CASE
              WHEN b.shares_held > 0 AND sqp.close_price IS NOT NULL
                THEN ROUND((b.shares_held::numeric * sqp.close_price) / 1e7, 2)
              WHEN b.shares_held > 0 AND px.price_per_share IS NOT NULL
                THEN ROUND((b.shares_held::numeric * px.price_per_share) / 1e7, 2)
              ELSE NULL
            END
          ) AS market_value_cr
        FROM base b
        LEFT JOIN stock_quarter_prices sqp
          ON sqp.stock_id = b.stock_id AND sqp.quarter = b.quarter
        LEFT JOIN LATERAL (
          SELECT (eh.market_value_cr * 1e7 / NULLIF(eh.shares_held, 0))::numeric AS price_per_share
          FROM entity_holdings eh
          WHERE eh.stock_id = b.stock_id
            AND eh.quarter = b.quarter
            AND eh.strategy_id IS NULL
            AND eh.market_value_cr > 0
            AND eh.shares_held > 0
          LIMIT 1
        ) px ON TRUE
      )
      SELECT
        s.name AS stock_name,
        s.slug AS stock_slug,
        s.nse_symbol,
        s.isin,
        s.bse_code,
        v.shares_held,
        v.pct_of_company,
        v.market_value_cr,
        ch.change_type,
        ch.pct_change,
        ch.prev_pct,
        v.quarter
      FROM valued v
      JOIN te ON TRUE
      JOIN stocks s ON s.id = v.stock_id
      LEFT JOIN LATERAL (
        SELECT
          ec.change_type,
          ec.pct_change,
          CASE
            WHEN ec.change_type = 'fresh_entry' THEN 0::numeric
            WHEN ec.change_type = 'complete_exit' THEN prev_eh.pct_of_company
            ELSE COALESCE(prev_eh.pct_of_company, GREATEST(0, COALESCE(v.pct_of_company, 0) - COALESCE(ec.pct_change, 0)))
          END AS prev_pct
        FROM entity_changes ec
        LEFT JOIN entity_holdings prev_eh
          ON prev_eh.entity_id = te.id
         AND prev_eh.quarter = ec.prev_quarter
         AND prev_eh.strategy_id IS NULL
         AND prev_eh.stock_id IN (
           SELECT s3.id
           FROM stocks s3
           WHERE COALESCE(NULLIF(UPPER(TRIM(s3.isin)), ''), NULLIF(UPPER(TRIM(s3.nse_symbol)), ''), NULLIF(TRIM(s3.bse_code), ''), s3.slug)
             = COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)
         )
        WHERE ec.entity_id = te.id
          AND ec.strategy_id IS NULL
          AND ec.quarter = v.quarter
          AND ec.stock_id IN (
            SELECT s2.id
            FROM stocks s2
            WHERE COALESCE(NULLIF(UPPER(TRIM(s2.isin)), ''), NULLIF(UPPER(TRIM(s2.nse_symbol)), ''), NULLIF(TRIM(s2.bse_code), ''), s2.slug)
              = COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)
          )
        ORDER BY
          CASE WHEN ec.change_type IS NOT NULL AND ec.change_type <> 'unchanged' THEN 0 ELSE 1 END,
          ec.pct_change DESC NULLS LAST
        LIMIT 1
      ) ch ON TRUE
      WHERE (SELECT q FROM target_q) IS NOT NULL
      ORDER BY v.pct_of_company DESC NULLS LAST, v.market_value_cr DESC NULLS LAST
    `) as EntityHoldingDbRow[];
    const mapped = rows.map((r) => ({
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      nseSymbol: r.nse_symbol ?? null,
      isin: r.isin ?? null,
      bseCode: r.bse_code ?? null,
      shares: toNum(r.shares_held),
      pctOfCompany: toNum(r.pct_of_company),
      marketValueCr: toNum(r.market_value_cr),
      changeType: r.change_type ?? null,
      pctChange: toNum(r.pct_change),
      prevPct: toNum(r.prev_pct),
      quarter: quarterToIso(r.quarter),
    }));
    return dedupeHoldingsByStock(mapped).sort(
      (a, b) =>
        (b.pctOfCompany ?? 0) - (a.pctOfCompany ?? 0) ||
        (b.marketValueCr ?? 0) - (a.marketValueCr ?? 0),
    );
  } catch {
    return [];
  }
}

/** Per-stock QoQ changes for one or more quarters (powers expandable trajectory). */
export async function getEntityQuarterChangeDetails(
  entitySlug: string,
  quarters: string[],
): Promise<EntityQuarterChangeDetail[]> {
  if (!sql || quarters.length === 0) return [];
  try {
    const rows = (await sql!`
      SELECT DISTINCT ON (ec.entity_id, ec.quarter, COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug))
        ec.quarter,
        ec.prev_quarter,
        ec.change_type,
        ec.pct_change,
        s.name AS stock_name,
        s.slug AS stock_slug,
        s.nse_symbol,
        s.isin,
        s.bse_code,
        COALESCE(curr.pct_of_company, CASE WHEN ec.change_type = 'complete_exit' THEN 0 END) AS new_pct,
        CASE
          WHEN ec.change_type = 'fresh_entry' THEN 0::numeric
          WHEN ec.change_type = 'complete_exit' THEN prev_eh.pct_of_company
          ELSE COALESCE(prev_eh.pct_of_company, GREATEST(0, COALESCE(curr.pct_of_company, 0) - COALESCE(ec.pct_change, 0)))
        END AS prev_pct,
        COALESCE(
          curr.market_value_cr,
          CASE
            WHEN COALESCE(curr.shares_held, sph_curr.shares) > 0
              AND COALESCE(sqp_curr.close_price, px_curr.price_per_share) IS NOT NULL
              THEN ROUND(
                (COALESCE(curr.shares_held, sph_curr.shares)::numeric
                  * COALESCE(sqp_curr.close_price, px_curr.price_per_share)) / 1e7,
                2
              )
            ELSE NULL
          END
        ) AS new_value_cr,
        COALESCE(
          prev_eh.market_value_cr,
          CASE
            WHEN COALESCE(prev_eh.shares_held, sph_prev.shares) > 0
              AND COALESCE(sqp_prev.close_price, px_prev.price_per_share) IS NOT NULL
              THEN ROUND(
                (COALESCE(prev_eh.shares_held, sph_prev.shares)::numeric
                  * COALESCE(sqp_prev.close_price, px_prev.price_per_share)) / 1e7,
                2
              )
            ELSE NULL
          END
        ) AS prev_value_cr
      FROM entity_changes ec
      JOIN tracked_entities te ON te.id = ec.entity_id
      JOIN stocks s ON s.id = ec.stock_id
      LEFT JOIN entity_holdings curr
        ON curr.entity_id = ec.entity_id
       AND curr.stock_id = ec.stock_id
       AND curr.quarter = ec.quarter
       AND curr.strategy_id IS NULL
      LEFT JOIN entity_holdings prev_eh
        ON prev_eh.entity_id = ec.entity_id
       AND prev_eh.stock_id = ec.stock_id
       AND prev_eh.quarter = ec.prev_quarter
       AND prev_eh.strategy_id IS NULL
      LEFT JOIN shareholding_pattern_holders sph_curr
        ON sph_curr.entity_id = ec.entity_id
       AND sph_curr.stock_id = ec.stock_id
       AND sph_curr.quarter = ec.quarter
       AND sph_curr.is_promoter = FALSE
      LEFT JOIN shareholding_pattern_holders sph_prev
        ON sph_prev.entity_id = ec.entity_id
       AND sph_prev.stock_id = ec.stock_id
       AND sph_prev.quarter = ec.prev_quarter
       AND sph_prev.is_promoter = FALSE
      LEFT JOIN stock_quarter_prices sqp_curr
        ON sqp_curr.stock_id = ec.stock_id AND sqp_curr.quarter = ec.quarter
      LEFT JOIN stock_quarter_prices sqp_prev
        ON sqp_prev.stock_id = ec.stock_id AND sqp_prev.quarter = ec.prev_quarter
      LEFT JOIN LATERAL (
        SELECT (eh.market_value_cr * 1e7 / NULLIF(eh.shares_held, 0))::numeric AS price_per_share
        FROM entity_holdings eh
        WHERE eh.stock_id = ec.stock_id
          AND eh.quarter = ec.quarter
          AND eh.strategy_id IS NULL
          AND eh.market_value_cr > 0
          AND eh.shares_held > 0
        LIMIT 1
      ) px_curr ON TRUE
      LEFT JOIN LATERAL (
        SELECT (eh.market_value_cr * 1e7 / NULLIF(eh.shares_held, 0))::numeric AS price_per_share
        FROM entity_holdings eh
        WHERE eh.stock_id = ec.stock_id
          AND eh.quarter = ec.prev_quarter
          AND eh.strategy_id IS NULL
          AND eh.market_value_cr > 0
          AND eh.shares_held > 0
        LIMIT 1
      ) px_prev ON TRUE
      WHERE te.slug = ${entitySlug}
        AND ec.strategy_id IS NULL
        AND ec.quarter = ANY(${quarters}::date[])
      ORDER BY ec.entity_id, ec.quarter, COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug),
        ABS(COALESCE(ec.pct_change, 0)) DESC,
        curr.market_value_cr DESC NULLS LAST,
        ec.stock_id DESC
    `) as Array<{
      quarter: unknown;
      prev_quarter: unknown;
      change_type: string;
      pct_change: unknown;
      stock_name: string;
      stock_slug: string;
      nse_symbol: string | null;
      isin: string | null;
      bse_code: string | null;
      new_pct: unknown;
      prev_pct: unknown;
      new_value_cr: unknown;
      prev_value_cr: unknown;
    }>;

    const byQuarter = new Map<string, EntityQuarterChangeDetail>();
    for (const r of rows) {
      const q = quarterToIso(r.quarter) ?? '';
      if (!byQuarter.has(q)) {
        byQuarter.set(q, {
          quarter: q,
          prevQuarter: quarterToIso(r.prev_quarter),
          rows: [],
        });
      }
      byQuarter.get(q)!.rows.push({
        stockName: r.stock_name,
        stockSlug: r.stock_slug,
        nseSymbol: r.nse_symbol ?? null,
        isin: r.isin ?? null,
        bseCode: r.bse_code ?? null,
        changeType: r.change_type,
        prevPct: toNum(r.prev_pct),
        newPct: toNum(r.new_pct),
        pctChange: toNum(r.pct_change),
        marketValueCr: toNum(r.new_value_cr),
        prevMarketValueCr: toNum(r.prev_value_cr),
      });
    }

    for (const detail of byQuarter.values()) {
      detail.rows = dedupeStockChangeRows(detail.rows);
    }

    const emptyQuarters = quarters.filter((q) => !byQuarter.has(q) || byQuarter.get(q)!.rows.length === 0);
    if (emptyQuarters.length > 0) {
      const snapshots = await loadEntityHoldingsSnapshots(entitySlug, emptyQuarters);
      for (const snap of snapshots) {
        if (!snap.rows.length) continue;
        byQuarter.set(snap.quarter, {
          quarter: snap.quarter,
          prevQuarter: snap.prevQuarter,
          rows: snap.rows,
        });
      }
    }

    return quarters
      .map((q) => byQuarter.get(q))
      .filter((d): d is EntityQuarterChangeDetail => !!d);
  } catch {
    return [];
  }
}

/** Holdings snapshot when entity_changes is empty (expandable quarter panel fallback). */
async function loadEntityHoldingsSnapshots(
  entitySlug: string,
  quarters: string[],
): Promise<EntityQuarterChangeDetail[]> {
  if (!sql || quarters.length === 0) return [];
  try {
    const rows = (await sql!`
      WITH te AS (
        SELECT id FROM tracked_entities WHERE slug = ${entitySlug}
      ),
      eh_base AS (
        SELECT DISTINCT ON (eh.stock_id, eh.quarter)
          eh.stock_id,
          eh.quarter,
          eh.shares_held,
          eh.pct_of_company,
          eh.market_value_cr
        FROM entity_holdings eh
        JOIN te ON te.id = eh.entity_id
        WHERE eh.strategy_id IS NULL
          AND eh.quarter = ANY(${quarters}::date[])
        ORDER BY eh.stock_id, eh.quarter, eh.pct_of_company DESC NULLS LAST, eh.id DESC
      ),
      sph_base AS (
        SELECT
          sph.stock_id,
          sph.quarter,
          SUM(sph.shares)::bigint AS shares_held,
          ROUND(SUM(sph.pct_of_company)::numeric, 3) AS pct_of_company,
          NULL::numeric AS market_value_cr
        FROM shareholding_pattern_holders sph
        JOIN te ON te.id = sph.entity_id
        WHERE sph.is_promoter = FALSE
          AND sph.pct_of_company >= 1.0
          AND COALESCE(sph.match_confidence, 0) >= 0.85
          AND sph.quarter = ANY(${quarters}::date[])
        GROUP BY sph.stock_id, sph.quarter
      ),
      base AS (
        SELECT * FROM eh_base
        UNION ALL
        SELECT sb.*
        FROM sph_base sb
        WHERE NOT EXISTS (
          SELECT 1 FROM eh_base eb
          WHERE eb.stock_id = sb.stock_id AND eb.quarter = sb.quarter
        )
      ),
      valued AS (
        SELECT
          b.stock_id,
          b.quarter,
          b.pct_of_company,
          COALESCE(
            b.market_value_cr,
            CASE
              WHEN b.shares_held > 0 AND sqp.close_price IS NOT NULL
                THEN ROUND((b.shares_held::numeric * sqp.close_price) / 1e7, 2)
              WHEN b.shares_held > 0 AND px.price_per_share IS NOT NULL
                THEN ROUND((b.shares_held::numeric * px.price_per_share) / 1e7, 2)
              ELSE NULL
            END
          ) AS market_value_cr
        FROM base b
        LEFT JOIN stock_quarter_prices sqp
          ON sqp.stock_id = b.stock_id AND sqp.quarter = b.quarter
        LEFT JOIN LATERAL (
          SELECT (eh.market_value_cr * 1e7 / NULLIF(eh.shares_held, 0))::numeric AS price_per_share
          FROM entity_holdings eh
          WHERE eh.stock_id = b.stock_id
            AND eh.quarter = b.quarter
            AND eh.strategy_id IS NULL
            AND eh.market_value_cr > 0
            AND eh.shares_held > 0
          LIMIT 1
        ) px ON TRUE
      )
      SELECT
        v.quarter,
        s.name AS stock_name,
        s.slug AS stock_slug,
        s.nse_symbol,
        s.isin,
        s.bse_code,
        v.pct_of_company AS new_pct,
        v.market_value_cr AS new_value_cr
      FROM valued v
      JOIN stocks s ON s.id = v.stock_id
      ORDER BY v.quarter DESC, v.pct_of_company DESC NULLS LAST
    `) as Array<{
      quarter: unknown;
      stock_name: string;
      stock_slug: string;
      nse_symbol: string | null;
      isin: string | null;
      bse_code: string | null;
      new_pct: unknown;
      new_value_cr: unknown;
    }>;

    const byQuarter = new Map<string, EntityQuarterChangeDetail>();
    for (const r of rows) {
      const q = quarterToIso(r.quarter) ?? '';
      if (!byQuarter.has(q)) {
        byQuarter.set(q, { quarter: q, prevQuarter: null, rows: [] });
      }
      byQuarter.get(q)!.rows.push({
        stockName: r.stock_name,
        stockSlug: r.stock_slug,
        nseSymbol: r.nse_symbol ?? null,
        isin: r.isin ?? null,
        bseCode: r.bse_code ?? null,
        changeType: 'unchanged',
        prevPct: toNum(r.new_pct),
        newPct: toNum(r.new_pct),
        pctChange: 0,
        marketValueCr: toNum(r.new_value_cr),
        prevMarketValueCr: toNum(r.new_value_cr),
      });
    }

    for (const detail of byQuarter.values()) {
      detail.rows = dedupeStockChangeRows(detail.rows);
    }

    return quarters
      .map((q) => byQuarter.get(q))
      .filter((d): d is EntityQuarterChangeDetail => !!d && d.rows.length > 0);
  } catch {
    return [];
  }
}

export interface EntityQuarterHistoryRow {
  quarter: string;
  totalHoldings: number | null;
  portfolioValueCr: number | null;
  freshEntries: number | null;
  adds: number | null;
  exits: number | null;
  trims: number | null;
}

/** Last N quarters of portfolio stats + move counts for trend display. */
export async function getEntityQuarterHistory(
  entitySlug: string,
  limit = 4,
): Promise<EntityQuarterHistoryRow[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      SELECT
        eqs.quarter,
        COALESCE(NULLIF(eh_live.cnt, 0), sph_live.cnt, 0) AS total_holdings,
        COALESCE(NULLIF(eh_live.value_cr, 0), sph_live.value_cr) AS portfolio_value_cr,
        mov.fresh_entries,
        mov.adds,
        mov.exits,
        mov.trims
      FROM tracked_entities te
      JOIN entity_quarterly_stats eqs
        ON eqs.entity_id = te.id AND eqs.strategy_id IS NULL
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS cnt,
          ROUND(SUM(value_cr)::numeric, 2) AS value_cr
        FROM (
          SELECT
            MAX(COALESCE(
              eh.market_value_cr,
              CASE
                WHEN eh.shares_held > 0 AND sqp.close_price IS NOT NULL
                  THEN (eh.shares_held::numeric * sqp.close_price) / 1e7
                WHEN eh.shares_held > 0 AND px.price_per_share IS NOT NULL
                  THEN (eh.shares_held::numeric * px.price_per_share) / 1e7
                ELSE NULL
              END
            )) AS value_cr
          FROM entity_holdings eh
          JOIN stocks s ON s.id = eh.stock_id
          LEFT JOIN stock_quarter_prices sqp
            ON sqp.stock_id = eh.stock_id AND sqp.quarter = eh.quarter
          LEFT JOIN LATERAL (
            SELECT (eh2.market_value_cr * 1e7 / NULLIF(eh2.shares_held, 0))::numeric AS price_per_share
            FROM entity_holdings eh2
            WHERE eh2.stock_id = eh.stock_id
              AND eh2.quarter = eh.quarter
              AND eh2.strategy_id IS NULL
              AND eh2.market_value_cr > 0
              AND eh2.shares_held > 0
            LIMIT 1
          ) px ON TRUE
          WHERE eh.entity_id = te.id
            AND eh.strategy_id IS NULL
            AND eh.quarter = eqs.quarter
          GROUP BY ${sql.unsafe(STOCK_LISTING_KEY)}
        ) deduped
      ) eh_live ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS cnt,
          ROUND(SUM(value_cr)::numeric, 2) AS value_cr
        FROM (
          SELECT
            MAX(CASE
              WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
                THEN (sph.shares::numeric * sqp.close_price) / 1e7
              ELSE NULL
            END) AS value_cr
          FROM shareholding_pattern_holders sph
          JOIN stocks s ON s.id = sph.stock_id
          LEFT JOIN stock_quarter_prices sqp
            ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
          WHERE sph.entity_id = te.id
            AND sph.is_promoter = FALSE
            AND sph.pct_of_company >= 1.0
            AND COALESCE(sph.match_confidence, 0) >= 0.85
            AND sph.quarter = eqs.quarter
          GROUP BY ${sql.unsafe(STOCK_LISTING_KEY)}
        ) deduped
      ) sph_live ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE d.change_type = 'fresh_entry')   AS fresh_entries,
          COUNT(*) FILTER (WHERE d.change_type = 'increased')     AS adds,
          COUNT(*) FILTER (WHERE d.change_type = 'complete_exit') AS exits,
          COUNT(*) FILTER (WHERE d.change_type = 'decreased')     AS trims
        FROM (
          SELECT DISTINCT ON (${sql.unsafe(STOCK_LISTING_KEY)})
            ec.change_type
          FROM entity_changes ec
          JOIN stocks s ON s.id = ec.stock_id
          WHERE ec.entity_id = te.id
            AND ec.strategy_id IS NULL
            AND ec.quarter = eqs.quarter
          ORDER BY ${sql.unsafe(STOCK_LISTING_KEY)},
            CASE ec.change_type
              WHEN 'fresh_entry' THEN 0 WHEN 'complete_exit' THEN 1
              WHEN 'increased' THEN 2 WHEN 'decreased' THEN 3 ELSE 4
            END
        ) d
      ) mov ON TRUE
      WHERE te.slug = ${entitySlug}
      ORDER BY eqs.quarter DESC
      LIMIT ${limit}
    `) as Array<{
      quarter: string;
      total_holdings: unknown;
      portfolio_value_cr: unknown;
      fresh_entries: unknown;
      adds: unknown;
      exits: unknown;
      trims: unknown;
    }>;
    return rows.map((r) => ({
      quarter: quarterToIso(r.quarter) ?? '',
      totalHoldings: toNum(r.total_holdings),
      portfolioValueCr: toNum(r.portfolio_value_cr),
      freshEntries: toNum(r.fresh_entries),
      adds: toNum(r.adds),
      exits: toNum(r.exits),
      trims: toNum(r.trims),
    }));
  } catch {
    return [];
  }
}

/** One-line QoQ trend summary from quarter history (newest first). */
export function summarizeQuarterTrend(history: EntityQuarterHistoryRow[]): string | null {
  if (history.length < 2) return null;
  const latest = history[0];
  const prior = history[1];
  const parts: string[] = [];

  const holdDelta = (latest.totalHoldings ?? 0) - (prior.totalHoldings ?? 0);
  if (holdDelta !== 0) {
    parts.push(holdDelta > 0 ? `${holdDelta} more holdings vs prior quarter` : `${Math.abs(holdDelta)} fewer holdings vs prior quarter`);
  }

  const adds = (latest.freshEntries ?? 0) + (latest.adds ?? 0);
  const trims = (latest.exits ?? 0) + (latest.trims ?? 0);
  if (adds > 0 || trims > 0) {
    parts.push(`${adds} add${adds === 1 ? '' : 's'} / ${trims} trim${trims === 1 ? '' : 's'} this quarter`);
  }

  if (history.length >= 4) {
    const oldest = history[history.length - 1];
    const spanDelta = (latest.totalHoldings ?? 0) - (oldest.totalHoldings ?? 0);
    if (spanDelta !== 0) {
      parts.push(
        spanDelta > 0
          ? `+${spanDelta} net holdings over ${history.length} quarters`
          : `${spanDelta} net holdings over ${history.length} quarters`,
      );
    }
  }

  return parts.length ? parts.join(' · ') : 'Portfolio steady quarter-on-quarter';
}

// ─── Neon enrichment (migration 005 — optional) ──────────────────
//
// Wrapped in try/catch + a feature check so the static build never hard-fails
// when the 005 tables are absent or empty. Mirrors the graceful-skip contract
// in db/verify-schema.mjs.

let liveStatsCache: Map<string, EntityLiveStats> | null = null;

async function loadLiveStats(): Promise<Map<string, EntityLiveStats>> {
  // Dev server keeps the module hot — skip cache so pipeline/DB updates show immediately.
  if (!import.meta.env.DEV && liveStatsCache) return liveStatsCache;
  const map = new Map<string, EntityLiveStats>();
  if (!sql) return map;

  try {
    // Outer-join the latest entity stats with the latest-quarter move counts.
    // Both come from migration 005 (entity_quarterly_stats + entity_changes).
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM entity_quarterly_stats
      )
      SELECT
        te.slug,
        eqs.quarter,
        COALESCE(NULLIF(eh_live.cnt, 0), sph_live.cnt, 0) AS total_holdings,
        COALESCE(NULLIF(eh_live.value_cr, 0), sph_live.value_cr) AS portfolio_value_cr,
        eqs.top5_concentration,
        eqs.large_cap_pct,
        eqs.mid_cap_pct,
        eqs.small_cap_pct,
        mov.fresh_entries,
        mov.exits,
        mov.adds,
        mov.trims
      FROM tracked_entities te
      LEFT JOIN entity_quarterly_stats eqs
        ON eqs.entity_id = te.id AND eqs.strategy_id IS NULL
       AND eqs.quarter = (SELECT q FROM latest)
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS cnt,
          ROUND(SUM(value_cr)::numeric, 2) AS value_cr
        FROM (
          SELECT
            MAX(COALESCE(
              eh.market_value_cr,
              CASE
                WHEN eh.shares_held > 0 AND sqp.close_price IS NOT NULL
                  THEN (eh.shares_held::numeric * sqp.close_price) / 1e7
                ELSE NULL
              END
            )) AS value_cr
          FROM entity_holdings eh
          JOIN stocks s ON s.id = eh.stock_id
          LEFT JOIN stock_quarter_prices sqp
            ON sqp.stock_id = eh.stock_id AND sqp.quarter = eh.quarter
          WHERE eh.entity_id = te.id
            AND eh.strategy_id IS NULL
            AND eh.quarter = (SELECT q FROM latest)
          GROUP BY ${sql.unsafe(STOCK_LISTING_KEY)}
        ) deduped
      ) eh_live ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS cnt,
          ROUND(SUM(value_cr)::numeric, 2) AS value_cr
        FROM (
          SELECT
            MAX(CASE
              WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
                THEN (sph.shares::numeric * sqp.close_price) / 1e7
              ELSE NULL
            END) AS value_cr
          FROM shareholding_pattern_holders sph
          JOIN stocks s ON s.id = sph.stock_id
          LEFT JOIN stock_quarter_prices sqp
            ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
          WHERE sph.entity_id = te.id
            AND sph.is_promoter = FALSE
            AND sph.pct_of_company >= 1.0
            AND COALESCE(sph.match_confidence, 0) >= 0.85
            AND sph.quarter = (SELECT q FROM latest)
          GROUP BY ${sql.unsafe(STOCK_LISTING_KEY)}
        ) deduped
      ) sph_live ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE d.change_type = 'fresh_entry')   AS fresh_entries,
          COUNT(*) FILTER (WHERE d.change_type = 'increased')     AS adds,
          COUNT(*) FILTER (WHERE d.change_type = 'complete_exit') AS exits,
          COUNT(*) FILTER (WHERE d.change_type = 'decreased')     AS trims
        FROM (
          SELECT DISTINCT ON (${sql.unsafe(STOCK_LISTING_KEY)})
            ec.change_type
          FROM entity_changes ec
          JOIN stocks s ON s.id = ec.stock_id
          WHERE ec.entity_id = te.id
            AND ec.strategy_id IS NULL
            AND ec.quarter = (SELECT q FROM latest)
          ORDER BY ${sql.unsafe(STOCK_LISTING_KEY)},
            CASE ec.change_type
              WHEN 'fresh_entry' THEN 0 WHEN 'complete_exit' THEN 1
              WHEN 'increased' THEN 2 WHEN 'decreased' THEN 3 ELSE 4
            END
        ) d
      ) mov ON TRUE
    `) as EntityStatsRow[];
    for (const r of rows) {
      map.set(r.slug, {
        quarter: quarterToIso(r.quarter),
        totalHoldings: toNum(r.total_holdings),
        portfolioValueCr: toNum(r.portfolio_value_cr),
        top5Concentration: toNum(r.top5_concentration),
        largeCapPct: toNum(r.large_cap_pct),
        midCapPct: toNum(r.mid_cap_pct),
        smallCapPct: toNum(r.small_cap_pct),
        freshEntries: toNum(r.fresh_entries),
        exits: toNum(r.exits),
        adds: toNum(r.adds),
        trims: toNum(r.trims),
      });
    }
  } catch {
    // 005 tables absent or query failed — fall back to static-only cards.
  }
  if (!import.meta.env.DEV) liveStatsCache = map;
  return map;
}

/** Enrich a list of entities with live stats (no-op when DB is unavailable). */
export async function withLiveStats(entities: Entity[]): Promise<Array<Entity & { live?: EntityLiveStats }>> {
  const stats = await loadLiveStats();
  return entities.map((e) => ({ ...e, live: stats.get(e.slug) ?? undefined }));
}

/** Enrich a single entity. */
export async function getEntityWithLive(slug: string): Promise<(Entity & { live?: EntityLiveStats }) | undefined> {
  const e = findEntityBySlug(slug);
  if (!e) return undefined;
  const stats = await loadLiveStats();
  return { ...e, live: stats.get(e.slug) ?? undefined };
}

// ─── Aggregate "latest quarter" snapshot for landing pages ───────
//
// Powers the headline stats strip on /super-investors etc.: total tracked
// entities, stocks held, aggregate portfolio value, latest quarter label.

export interface TrackedSnapshot {
  entityCount: number;
  stocksHeld: number | null;
  totalValueCr: number | null;
  latestQuarter: string | null;
  sourceFeeds: string[];
}

export async function getTrackedSnapshot(): Promise<TrackedSnapshot> {
  const entityCount = getAllTrackedEntities().length;
  const base: TrackedSnapshot = {
    entityCount,
    stocksHeld: null,
    totalValueCr: null,
    latestQuarter: null,
    sourceFeeds: ['NSE/BSE Shareholding Pattern', 'SAST'],
  };
  if (!sql) return base;
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM entity_holdings WHERE strategy_id IS NULL
      )
      SELECT
        (SELECT COUNT(*)::int FROM (
          SELECT ${sql.unsafe(STOCK_LISTING_KEY)} AS k
          FROM entity_holdings eh
          JOIN stocks s ON s.id = eh.stock_id
          WHERE eh.strategy_id IS NULL
            AND eh.quarter = (SELECT q FROM latest)
          GROUP BY ${sql.unsafe(STOCK_LISTING_KEY)}
        ) deduped_stocks) AS stocks_held,
        (SELECT ROUND(SUM(value_cr)::numeric, 2) FROM (
          SELECT MAX(eh.market_value_cr) AS value_cr
          FROM entity_holdings eh
          JOIN stocks s ON s.id = eh.stock_id
          WHERE eh.strategy_id IS NULL
            AND eh.quarter = (SELECT q FROM latest)
          GROUP BY eh.entity_id, ${sql.unsafe(STOCK_LISTING_KEY)}
        ) deduped_vals) AS total_value_cr,
        (SELECT MAX(quarter)::text FROM entity_holdings WHERE strategy_id IS NULL) AS latest_quarter
    `) as SnapshotRow[];
    const r = rows[0];
    return {
      ...base,
      stocksHeld: r?.stocks_held ?? null,
      totalValueCr: r?.total_value_cr ?? null,
      latestQuarter: quarterToIso(r?.latest_quarter),
    };
  } catch {
    return base;
  }
}

// ─── URL helpers ──────────────────────────────────────────────────

export const SUPER_INVESTORS_HUB = '/super-investors';
export const ONE_PERCENT_CLUB_HUB = '/1-percent-club';
export const SAST_UPDATES_HUB = '/super-investors/sast-updates';

export type StockEmptyStateKind =
  | 'not_indexed'
  | 'not_indexed_mf_available'
  | 'no_institutional_radar'
  | 'no_institutional_radar_mf_available';

export interface StockEmptyStateContent {
  kind: StockEmptyStateKind;
  headline: string;
  body: string;
  footnote: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

const SHP_DISCLOSURE_FOOTNOTE =
  'Based on SEBI quarterly Shareholding Pattern filings — holdings below 1% are not disclosed by name.';

/** True when latest SHP shows no mutual fund, DII, FII, or curated super-investor ≥1% interest. */
export function hasSmartMoneyRadarInterest(
  detail: Pick<StockShareholdingDetail, 'fii' | 'mutualFunds' | 'dii' | 'superInvestors' | 'summary'>,
): boolean {
  if (detail.fii.length || detail.mutualFunds.length || detail.dii.length || detail.superInvestors.length) {
    return true;
  }
  if (detail.summary.dataQuality === 'verified') {
    const institutional =
      (detail.summary.fiiPct ?? 0) + (detail.summary.mfPct ?? 0) + (detail.summary.diiExMfPct ?? 0);
    return institutional > 0.01;
  }
  return false;
}

export function hasCuratedSuperInvestorInterest(
  detail: Pick<StockShareholdingDetail, 'superInvestors'>,
): boolean {
  return detail.superInvestors.length > 0;
}

export function getStockEmptyStateContent(options: {
  stockName?: string;
  mfStockSignalUrl?: string | null;
  context: 'search' | 'page';
}): StockEmptyStateContent {
  const name = options.stockName?.trim();
  const label = name || 'This stock';
  const mfUrl = options.mfStockSignalUrl?.trim() || null;
  const hasMf = Boolean(mfUrl);

  if (options.context === 'search') {
    if (hasMf) {
      return {
        kind: 'not_indexed_mf_available',
        headline: `No 1% Club page for ${label}`,
        body: `We don't have Shareholding Pattern holder data for ${label} in the 1% Club yet — but mutual funds are actively tracked. See institutional conviction from AMC disclosures instead.`,
        footnote: SHP_DISCLOSURE_FOOTNOTE,
        primaryCta: { label: `View ${label} MF Stock Signal`, href: mfUrl! },
        secondaryCta: { label: 'Browse 1% Club stocks', href: ONE_PERCENT_CLUB_HUB },
      };
    }
    return {
      kind: 'not_indexed',
      headline: name ? `No 1% Club data for ${name}` : 'No matching stock in our 1% Club',
      body: name
        ? `We don't track ${name} yet, or no mutual fund, DII, FII, or super investor holds ≥1% in the latest quarter we have on file.`
        : 'We could not find this stock in the 1% Club. Try another spelling, or check back after the next quarterly SHP update.',
      footnote: SHP_DISCLOSURE_FOOTNOTE,
      secondaryCta: { label: 'Browse super investors', href: SUPER_INVESTORS_HUB },
    };
  }

  if (hasMf) {
    return {
      kind: 'no_institutional_radar_mf_available',
      headline: 'Not on the institutional radar',
      body: `In the latest Shareholding Pattern filing, ${label} has no disclosed ≥1% stake from mutual funds, DII, FII, or our curated super investors. Mutual fund activity may still show up in monthly AMC disclosures.`,
      footnote: SHP_DISCLOSURE_FOOTNOTE,
      primaryCta: { label: `View ${label} MF Stock Signal`, href: mfUrl! },
      secondaryCta: { label: 'Browse super investors', href: SUPER_INVESTORS_HUB },
    };
  }

  return {
    kind: 'no_institutional_radar',
    headline: 'Not on the institutional radar',
    body: `In the latest Shareholding Pattern filing, ${label} has no disclosed ≥1% stake from mutual funds, DII, FII, or our curated super investors.`,
    footnote: SHP_DISCLOSURE_FOOTNOTE,
    secondaryCta: { label: 'Browse 1% Club stocks', href: ONE_PERCENT_CLUB_HUB },
  };
}

/** @deprecated Use getStockEmptyStateContent */
export type StockNotOnRadarVariant = 'search' | 'page';

/** @deprecated Use getStockEmptyStateContent */
export function stockNotOnRadarMessage(
  stockName?: string,
  variant: StockNotOnRadarVariant = 'page',
): { headline: string; body: string } {
  const content = getStockEmptyStateContent({ stockName, context: variant });
  return { headline: content.headline, body: content.body };
}

/** Mystery holder result pages with fewer stocks are thin — noindex, omit from sitemap. */
export const HOLDER_PAGE_MIN_INDEXABLE_STOCKS = 2;

export function isHolderPageIndexable(stockCount: number): boolean {
  return stockCount >= HOLDER_PAGE_MIN_INDEXABLE_STOCKS;
}

/** Mystery holder static pages are disabled — only curated super-investor profiles get links. */
export function shouldBuildHolderPageFor(_stockCount: number, hasCuratedEntity: boolean): boolean {
  return hasCuratedEntity;
}

export function holderProfileUrl(holder: {
  entitySlug: string | null;
  holderSlug: string;
  stockCount?: number;
}): string | null {
  if (holder.entitySlug) return curatedEntityUrl(holder.entitySlug);
  return null;
}

/** True when a static super-investor profile exists (JSON roster). */
export function hasSuperInvestorProfile(entitySlug: string | null | undefined): boolean {
  if (!entitySlug) return false;
  return !!findEntityBySlug(entitySlug);
}

export function superInvestorUrl(slug: string): string {
  return `${SUPER_INVESTORS_HUB}/${slug}`;
}
export function onePercentStockUrl(slug: string): string {
  return `${ONE_PERCENT_CLUB_HUB}/${slug}`;
}
export function onePercentHolderUrl(holderSlug: string): string {
  return `${ONE_PERCENT_CLUB_HUB}/holder/${holderSlug}`;
}

/** Best URL for a curated entity: SI profile when built, else 1% Club holder aggregate page. */
export function curatedEntityUrl(entitySlug: string | null | undefined): string | null {
  if (!entitySlug) return null;
  if (hasSuperInvestorProfile(entitySlug)) return superInvestorUrl(entitySlug);
  return onePercentHolderUrl(entitySlug);
}

export function canonicalFor(path: string): string {
  return `${BRAND_URL}${path}`;
}

// ─── 1% Club — raw ≥1% holders from shareholding_pattern_holders ─
//
// The 1% Club is the *discovery* layer: every non-promoter ≥1% holder parsed
// from Shareholding Pattern filings, unfiltered. Curated entities
// (super-investors/AIF/PMS) are matched in; unmatched "mystery" holders are
// still surfaced so users can spot unknown smart money.

export interface OnePercentRow {
  id: number;
  stockId: number;
  stockName: string;
  stockSlug: string;
  holderName: string;
  holderType: string;
  shares: number | null;
  pctOfCompany: number | null;
  entityId: number | null;
  entitySlug: string | null;
  entityDisplayName: string | null;
  /** Curated entity type (individual/fii/dii) — preferred over raw SHP holder_type. */
  entityType: string | null;
  matchConfidence: number | null;
  quarter: string | null;
  marketValueCr: number | null;
  /** When multiple SHP filing names map to one curated entity. */
  filingNames?: string[];
  filingCount?: number;
}

/** Normalize filing name for dedupe (trustee suffix, spacing, discretionary quirks). */
function normalizeFilingGroupKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\(\s*trustee\s*[-–].*\)\s*$/i, '')
    .replace(/([a-z])discretionary/g, '$1 discretionary')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse duplicate SHP lines for the same filing name on one stock. */
function dedupeMembersByFilingName(members: OnePercentRow[]): OnePercentRow[] {
  const byName = new Map<string, OnePercentRow>();
  for (const m of members) {
    const key = normalizeFilingGroupKey(m.holderName);
    const prev = byName.get(key);
    if (!prev || (toNum(m.pctOfCompany) ?? 0) > (toNum(prev.pctOfCompany) ?? 0)) {
      byName.set(key, m);
    }
  }
  return [...byName.values()];
}

export function groupOnePercentHoldersByEntity(rows: OnePercentRow[]): OnePercentRow[] {
  const standalone: OnePercentRow[] = [];
  const byEntity = new Map<number, OnePercentRow[]>();

  for (const row of rows) {
    if (row.entityId == null) {
      standalone.push(row);
      continue;
    }
    const entityKey = Number(row.entityId);
    if (!Number.isFinite(entityKey)) continue;
    const group = byEntity.get(entityKey) ?? [];
    group.push(row);
    byEntity.set(entityKey, group);
  }

  const grouped: OnePercentRow[] = [...standalone];
  for (const rawMembers of byEntity.values()) {
    const members = dedupeMembersByFilingName(rawMembers);
    if (members.length === 1) {
      const one = members[0]!;
      grouped.push({
        ...one,
        holderType: one.entityType || one.holderType,
        filingCount: one.filingCount ?? 1,
      });
      continue;
    }
    const lead = members[0]!;
    const marketValues = members.map((m) => toNum(m.marketValueCr)).filter((v): v is number => v != null);
    const totalShares = members.reduce((sum, m) => sum + (toNum(m.shares) ?? 0), 0);
    const totalPct = members.reduce((sum, m) => sum + (toNum(m.pctOfCompany) ?? 0), 0);
    const filingNames = members.flatMap((m) => m.filingNames ?? [m.holderName]);
    grouped.push({
      ...lead,
      holderName: lead.entityDisplayName || lead.holderName,
      holderType: lead.entityType || lead.holderType,
      shares: totalShares > 0 ? totalShares : null,
      pctOfCompany: totalPct > 0 ? totalPct : null,
      marketValueCr: marketValues.length ? marketValues.reduce((a, b) => a + b, 0) : null,
      filingNames: [...new Set(filingNames)],
      filingCount: members.length,
    });
  }

  return grouped.sort((a, b) => (toNum(b.pctOfCompany) ?? 0) - (toNum(a.pctOfCompany) ?? 0));
}

export interface OnePercentStockAgg {
  stockId: number;
  stockName: string;
  stockSlug: string;
  holders: number;
  totalValueCr: number | null; // sum of ≥1% non-promoter disclosed stakes (₹ Cr)
  topPct: number | null;       // largest single non-promoter stake
}

export interface OnePercentSnapshot {
  latestQuarter: string | null;
  totalRows: number | null;
  distinctHolders: number | null;
  distinctStocks: number | null;
  unmatchedPct: number | null; // share of rows with no curated match (0..1)
}

/** Latest-quarter snapshot of the 1% Club (counts for landing page strip). */
export async function getOnePercentSnapshot(): Promise<OnePercentSnapshot> {
  const base: OnePercentSnapshot = {
    latestQuarter: null,
    totalRows: null,
    distinctHolders: null,
    distinctStocks: null,
    unmatchedPct: null,
  };
  if (!sql) return base;
  try {
    const rows = (await sql!`
      SELECT
        (SELECT MAX(quarter)::text         FROM shareholding_pattern_holders WHERE is_promoter = FALSE) AS latest_quarter,
        (SELECT COUNT(*)                   FROM shareholding_pattern_holders
          WHERE is_promoter = FALSE AND pct_of_company >= 1.0
            AND quarter = (SELECT MAX(quarter) FROM shareholding_pattern_holders WHERE is_promoter = FALSE)) AS total_rows,
        (SELECT COUNT(DISTINCT holder_name) FROM shareholding_pattern_holders
          WHERE is_promoter = FALSE AND pct_of_company >= 1.0
            AND quarter = (SELECT MAX(quarter) FROM shareholding_pattern_holders WHERE is_promoter = FALSE)) AS distinct_holders,
        (SELECT COUNT(DISTINCT stock_id)   FROM shareholding_pattern_holders
          WHERE is_promoter = FALSE AND pct_of_company >= 1.0
            AND quarter = (SELECT MAX(quarter) FROM shareholding_pattern_holders WHERE is_promoter = FALSE)) AS distinct_stocks,
        (SELECT AVG(CASE WHEN entity_id IS NULL THEN 1.0 ELSE 0.0 END) FROM shareholding_pattern_holders
          WHERE is_promoter = FALSE AND pct_of_company >= 1.0
            AND quarter = (SELECT MAX(quarter) FROM shareholding_pattern_holders WHERE is_promoter = FALSE)) AS unmatched_pct
    `) as OnePercentSnapshotRow[];
    const r = rows[0];
    return {
      latestQuarter: quarterToIso(r?.latest_quarter),
      totalRows: r?.total_rows ?? null,
      distinctHolders: r?.distinct_holders ?? null,
      distinctStocks: r?.distinct_stocks ?? null,
      unmatchedPct: r?.unmatched_pct ?? null,
    };
  } catch {
    return base;
  }
}

/** All stocks with ≥1% non-promoter holders (latest quarter) — for browse + search index. */
export async function getOnePercentAllStocks(): Promise<OnePercentStockAgg[]> {
  return getOnePercentTopStocks(10_000);
}

export interface HolderSearchRow {
  holderSlug: string;
  holderName: string;
  entitySlug: string | null;
  stockCount: number;
  topPct: number | null;
}

/** Distinct holder name slugs for static paths (latest quarter). */
export async function getDistinctHolderSlugs(): Promise<
  { holderSlug: string; holderName: string; entitySlug: string | null; stockCount: number }[]
> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      ),
      raw AS (
        SELECT
          sph.holder_name,
          sph.entity_id,
          te.slug AS entity_slug,
          te.display_name AS entity_display_name,
          COUNT(*)::int AS stock_count
        FROM (
          SELECT DISTINCT
            sph.holder_name,
            sph.entity_id,
            te.slug AS entity_slug,
            te.display_name AS entity_display_name,
            ${sql.unsafe(STOCK_LISTING_KEY)} AS listing_key
          FROM shareholding_pattern_holders sph
          JOIN stocks s ON s.id = sph.stock_id
          LEFT JOIN tracked_entities te ON te.id = sph.entity_id
          WHERE sph.quarter = (SELECT q FROM latest)
            AND sph.is_promoter = FALSE
            AND sph.pct_of_company >= 1.0
        ) sph
        GROUP BY sph.holder_name, sph.entity_id, sph.entity_slug, sph.entity_display_name
      ),
      curated AS (
        SELECT
          entity_id,
          COALESCE(MAX(entity_display_name), MAX(holder_name)) AS holder_name,
          MAX(entity_slug) AS entity_slug,
          SUM(stock_count)::int AS stock_count
        FROM raw
        WHERE entity_id IS NOT NULL
        GROUP BY entity_id
      ),
      mystery AS (
        SELECT
          MAX(holder_name) AS holder_name,
          MAX(entity_slug) AS entity_slug,
          SUM(stock_count)::int AS stock_count
        FROM (
          SELECT
            holder_name,
            entity_slug,
            stock_count,
            upper(regexp_replace(regexp_replace(trim(holder_name), '\\.+$', ''), '\\s+', ' ', 'g')) AS norm_key
          FROM raw
          WHERE entity_id IS NULL
        ) m
        GROUP BY norm_key
      )
      SELECT holder_name, entity_slug, stock_count FROM curated
      UNION ALL
      SELECT holder_name, entity_slug, stock_count FROM mystery
      ORDER BY holder_name
    `) as { holder_name: string; entity_slug: string | null; stock_count: number }[];
    return rows.map((r) => ({
      holderSlug: r.entity_slug || slugifyEntity(r.holder_name),
      holderName: r.holder_name,
      entitySlug: r.entity_slug,
      stockCount: Number(r.stock_count) || 0,
    }));
  } catch {
    return [];
  }
}

/** All ≥1% positions for a holder name slug (latest quarter). */
export async function getHoldingsByHolderSlug(
  holderSlug: string,
  knownHolder?: { holderName: string; entitySlug?: string | null },
): Promise<{
  holderName: string;
  entitySlug: string | null;
  rows: Array<{
    stockName: string;
    stockSlug: string;
    pctOfCompany: number | null;
    shares: number | null;
    marketValueCr: number | null;
    holderType: string;
  }>;
}> {
  if (!sql) return { holderName: holderSlug, entitySlug: null, rows: [] };
  try {
    let holderName = knownHolder?.holderName;
    let entitySlug = knownHolder?.entitySlug ?? null;
    let entityId: number | null = null;

    if (!holderName || !entitySlug) {
      const [entityRow] = (await sql!`
        SELECT id, slug, display_name FROM tracked_entities WHERE slug = ${holderSlug} LIMIT 1
      `) as { id: number; slug: string; display_name: string }[];
      if (entityRow) {
        entityId = entityRow.id;
        entitySlug = entityRow.slug;
        holderName = entityRow.display_name;
      }
    }

    if (!holderName) {
      const holders = await getDistinctHolderSlugs();
      const match = holders.find((h) => h.holderSlug === holderSlug || h.entitySlug === holderSlug);
      if (!match) return { holderName: holderSlug, entitySlug: null, rows: [] };
      holderName = match.holderName;
      entitySlug = match.entitySlug;
    }

    if (entitySlug && entityId == null) {
      const [entityRow] = (await sql!`
        SELECT id FROM tracked_entities WHERE slug = ${entitySlug} LIMIT 1
      `) as { id: number }[];
      entityId = entityRow?.id ?? null;
    }

    const rows = entityId != null
      ? ((await sql!`
          WITH latest AS (
            SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
          )
          SELECT
            (array_agg(s.name ORDER BY s.id))[1] AS stock_name,
            (array_agg(s.slug ORDER BY s.id))[1] AS stock_slug,
            (array_agg(s.nse_symbol ORDER BY s.id))[1] AS nse_symbol,
            (array_agg(s.isin ORDER BY s.id))[1] AS isin,
            (array_agg(s.bse_code ORDER BY s.id))[1] AS bse_code,
            MAX(sph.pct_of_company)::numeric AS pct_of_company,
            MAX(sph.shares)::bigint AS shares,
            ROUND(MAX(
              CASE
                WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
                  THEN (sph.shares::numeric * sqp.close_price) / 1e7
                ELSE NULL
              END
            ), 2) AS market_value_cr,
            MAX(sph.holder_type) AS holder_type,
            MAX(te.slug) AS entity_slug
          FROM shareholding_pattern_holders sph
          JOIN stocks s ON s.id = sph.stock_id
          LEFT JOIN tracked_entities te ON te.id = sph.entity_id
          LEFT JOIN stock_quarter_prices sqp
            ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
          WHERE sph.entity_id = ${entityId}
            AND sph.quarter = (SELECT q FROM latest)
            AND sph.is_promoter = FALSE
            AND sph.pct_of_company >= 1.0
          GROUP BY COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)
          ORDER BY pct_of_company DESC
        `) as HolderStockDbRow[])
      : ((await sql!`
          WITH latest AS (
            SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
          )
          SELECT
            (array_agg(s.name ORDER BY s.id))[1] AS stock_name,
            (array_agg(s.slug ORDER BY s.id))[1] AS stock_slug,
            (array_agg(s.nse_symbol ORDER BY s.id))[1] AS nse_symbol,
            (array_agg(s.isin ORDER BY s.id))[1] AS isin,
            (array_agg(s.bse_code ORDER BY s.id))[1] AS bse_code,
            MAX(sph.pct_of_company)::numeric AS pct_of_company,
            MAX(sph.shares)::bigint AS shares,
            ROUND(MAX(
              CASE
                WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
                  THEN (sph.shares::numeric * sqp.close_price) / 1e7
                ELSE NULL
              END
            ), 2) AS market_value_cr,
            MAX(sph.holder_type) AS holder_type,
            MAX(te.slug) AS entity_slug
          FROM shareholding_pattern_holders sph
          JOIN stocks s ON s.id = sph.stock_id
          LEFT JOIN tracked_entities te ON te.id = sph.entity_id
          LEFT JOIN stock_quarter_prices sqp
            ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
          WHERE sph.holder_name = ${holderName}
            AND sph.quarter = (SELECT q FROM latest)
            AND sph.is_promoter = FALSE
            AND sph.pct_of_company >= 1.0
          GROUP BY COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)
          ORDER BY pct_of_company DESC
        `) as HolderStockDbRow[]);

    const mapped = rows.map((r) => ({
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      nseSymbol: r.nse_symbol ?? null,
      isin: r.isin ?? null,
      bseCode: r.bse_code ?? null,
      pctOfCompany: r.pct_of_company ?? null,
      shares: r.shares ?? null,
      marketValueCr: toNum(r.market_value_cr),
      holderType: r.holder_type,
    }));
    const deduped = dedupeHoldingsByStock(mapped).sort(
      (a, b) => (Number(b.pctOfCompany) || 0) - (Number(a.pctOfCompany) || 0),
    );
    return {
      holderName,
      entitySlug: entitySlug ?? rows[0]?.entity_slug ?? null,
      rows: deduped.map(({ nseSymbol: _nse, isin: _isin, bseCode: _bse, ...row }) => row),
    };
  } catch {
    return { holderName: holderSlug, entitySlug: null, rows: [] };
  }
}

export interface OnePercentHolderPosition {
  stockSlug: string;
  stockName: string;
  pct: number | null;
  shares: number | null;
  marketValueCr: number | null;
}

export interface OnePercentSearchHolder {
  slug: string;
  name: string;
  entitySlug: string | null;
  profileUrl: string | null;
  stockCount: number;
  positions: OnePercentHolderPosition[];
}

/** Latest-quarter ≥1% positions grouped for holder name search (build time). */
export async function getOnePercentHolderPositionsMap(): Promise<
  Map<string, OnePercentHolderPosition[]>
> {
  const map = new Map<string, OnePercentHolderPosition[]>();
  if (!sql) return map;
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      )
      SELECT
        te.slug AS entity_slug,
        CASE WHEN sph.entity_id IS NOT NULL THEN NULL ELSE sph.holder_name END AS holder_name,
        (array_agg(s.slug ORDER BY s.id))[1] AS stock_slug,
        (array_agg(s.name ORDER BY s.id))[1] AS stock_name,
        MAX(sph.pct_of_company)::numeric AS pct_of_company,
        MAX(sph.shares)::bigint AS shares,
        ROUND(MAX(
          CASE
            WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
              THEN (sph.shares::numeric * sqp.close_price) / 1e7
            ELSE NULL
          END
        ), 2) AS market_value_cr
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN tracked_entities te ON te.id = sph.entity_id
      LEFT JOIN stock_quarter_prices sqp
        ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
      WHERE sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      GROUP BY
        te.slug,
        CASE WHEN sph.entity_id IS NOT NULL THEN NULL ELSE sph.holder_name END,
        COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)
      ORDER BY pct_of_company DESC
    `) as Array<{
      holder_name: string | null;
      entity_slug: string | null;
      stock_slug: string;
      stock_name: string;
      pct_of_company: unknown;
      shares: number | null;
      market_value_cr: unknown;
    }>;

    for (const r of rows) {
      const key = r.entity_slug
        ? `entity:${r.entity_slug}`
        : `name:${normalizeHolderSearchKey(r.holder_name ?? '')}`;
      const pos: OnePercentHolderPosition = {
        stockSlug: r.stock_slug,
        stockName: r.stock_name,
        pct: toNum(r.pct_of_company),
        shares: r.shares != null ? Number(r.shares) : null,
        marketValueCr: toNum(r.market_value_cr),
      };
      const list = map.get(key) ?? [];
      list.push(pos);
      map.set(key, list);
    }
  } catch {
    /* empty */
  }
  return map;
}

/** Build client search index at page build time. */
export async function getOnePercentSearchIndex(): Promise<{
  stocks: { slug: string; name: string }[];
  holders: OnePercentSearchHolder[];
}> {
  const [stocks, holders, positionsMap] = await Promise.all([
    getOnePercentStockSlugs(),
    getDistinctHolderSlugs(),
    getOnePercentHolderPositionsMap(),
  ]);

  const byKey = new Map<string, { slug: string; name: string; entitySlug: string | null; stockCount: number }>();
  for (const h of holders) {
    const key = h.entitySlug ? `entity:${h.entitySlug}` : `name:${normalizeHolderSearchKey(h.holderName)}`;
    const prev = byKey.get(key);
    if (!prev || (h.entitySlug && !prev.entitySlug) || h.stockCount > prev.stockCount) {
      byKey.set(key, {
        slug: h.holderSlug,
        name: h.holderName,
        entitySlug: h.entitySlug,
        stockCount: h.stockCount,
      });
    }
  }

  const holderList: OnePercentSearchHolder[] = [...byKey.values()]
    .map((h) => {
      const key = h.entitySlug
        ? `entity:${h.entitySlug}`
        : `name:${normalizeHolderSearchKey(h.name)}`;
      const positions = positionsMap.get(key) ?? [];
      const profileUrl = holderProfileUrl({
        entitySlug: h.entitySlug,
        holderSlug: h.slug,
        stockCount: h.stockCount,
      });
      return {
        slug: h.entitySlug || h.slug,
        name: h.name,
        entitySlug: h.entitySlug,
        profileUrl,
        stockCount: positions.length > 0 ? positions.length : h.stockCount,
        positions,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    stocks: stocks.map((s) => ({
      slug: s.slug,
      name: s.stockName,
      nseSymbol: s.nseSymbol ?? null,
    })),
    holders: holderList,
  };
}

/** Top stocks by number of distinct ≥1% non-promoter holders (landing page grid). */
export async function getOnePercentTopStocks(limit = 60): Promise<OnePercentStockAgg[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      )
      SELECT
        s.id        AS stock_id,
        s.name      AS stock_name,
        s.slug      AS stock_slug,
        COUNT(*)                                            AS holders,
        MAX(sph.pct_of_company)                             AS top_pct,
        ROUND(SUM(
          CASE
            WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
              THEN (sph.shares::numeric * sqp.close_price) / 1e7
            ELSE NULL
          END
        ), 2)                                               AS total_value_cr
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN stock_quarter_prices sqp
        ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
      WHERE sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      GROUP BY s.id, s.name, s.slug
      ORDER BY holders DESC, total_value_cr DESC NULLS LAST
      LIMIT ${limit}
    `) as OnePercentStockAggRow[];
    return rows.map((r) => ({
      stockId: r.stock_id,
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      holders: Number(r.holders),
      totalValueCr: toNum(r.total_value_cr),
      topPct: r.top_pct ?? null,
    }));
  } catch {
    return [];
  }
}

/** Detect mutual-fund rows in SHP (separate from other DII like insurance/AIF). */
export function isMutualFundHolderName(holderName: string, holderType?: string | null): boolean {
  const n = String(holderName || '').toLowerCase();
  if (/\bmutual\s*fund\b|\buti\b/i.test(n)) return true;
  if (holderType === 'dii' && /\b(fund|scheme)\b/i.test(n) && !/\baif\b|\balternate\s+investment\b/i.test(n)) {
    return true;
  }
  return false;
}

export interface ShpCategorySummary {
  quarter: string | null;
  promoterPct: number | null;
  fiiPct: number | null;
  mfPct: number | null;
  diiExMfPct: number | null;
  publicPct: number | null;
  individualsGte1Pct: number | null;
  retailPct: number | null;
  totalPct: number | null;
  sourceUrl: string | null;
  dataQuality: 'verified' | 'partial' | 'holders_only';
}

export interface StockShareholdingDetail {
  stockName: string;
  stockSlug: string;
  summary: ShpCategorySummary;
  promoters: OnePercentRow[];
  fii: OnePercentRow[];
  mutualFunds: OnePercentRow[];
  dii: OnePercentRow[];
  superInvestors: OnePercentRow[];
  onePercentClub: OnePercentRow[];
}

function bucketShpHolders(rows: OnePercentRow[]): Omit<StockShareholdingDetail, 'stockName' | 'stockSlug' | 'summary'> {
  const promoters: OnePercentRow[] = [];
  const fii: OnePercentRow[] = [];
  const mutualFunds: OnePercentRow[] = [];
  const dii: OnePercentRow[] = [];
  const superInvestors: OnePercentRow[] = [];
  const onePercentClub: OnePercentRow[] = [];

  for (const row of rows) {
    const type = (row.holderType || '').toLowerCase();
    const isPromoter = type === 'promoter';
    const isSI = Boolean(row.entitySlug && hasSuperInvestorProfile(row.entitySlug));

    if (isPromoter) {
      promoters.push(row);
      continue;
    }
    if (isSI) {
      superInvestors.push(row);
      continue;
    }
    if (type === 'fii') {
      fii.push(row);
      continue;
    }
    if (isMutualFundHolderName(row.holderName, row.holderType)) {
      mutualFunds.push(row);
      continue;
    }
    if (type === 'dii') {
      dii.push(row);
      continue;
    }
    onePercentClub.push(row);
  }

  return { promoters, fii, mutualFunds, dii, superInvestors, onePercentClub };
}

/** Full shareholding breakdown for a stock page (chart + expandable sections). */
export async function getStockShareholdingDetail(stockSlug: string): Promise<StockShareholdingDetail | null> {
  if (!sql) return null;
  try {
    const stockRows = (await sql!`
      SELECT id, name, slug FROM stocks WHERE slug = ${stockSlug} LIMIT 1
    `) as { id: number; name: string; slug: string }[];
    if (!stockRows.length) return null;
    const stock = stockRows[0]!;

    const latestRows = (await sql!`
      SELECT COALESCE(
        (SELECT MAX(quarter) FROM stock_shp_summary WHERE stock_id = ${stock.id}),
        (SELECT MAX(quarter) FROM shareholding_pattern_holders WHERE stock_id = ${stock.id})
      )::text AS q
    `) as { q: string | null }[];
    const latestQ = latestRows[0]?.q ?? null;
    if (!latestQ) return null;

    const summaryRows = (await sql!`
      SELECT promoter_pct, fii_pct, mf_pct, dii_ex_mf_pct, public_pct,
             individuals_gte1_pct, retail_pct, total_pct, source_url, quarter::text
      FROM stock_shp_summary
      WHERE stock_id = ${stock.id} AND quarter = ${latestQ}::date
      LIMIT 1
    `) as {
      promoter_pct: string | null;
      fii_pct: string | null;
      mf_pct: string | null;
      dii_ex_mf_pct: string | null;
      public_pct: string | null;
      individuals_gte1_pct: string | null;
      retail_pct: string | null;
      total_pct: string | null;
      source_url: string | null;
      quarter: string;
    }[];
    const summaryRow = summaryRows[0];

    const holderRows = (await sql!`
      SELECT
        sph.id,
        s.id AS stock_id,
        s.name AS stock_name,
        s.slug AS stock_slug,
        sph.holder_name,
        sph.holder_type,
        sph.shares,
        sph.pct_of_company,
        sph.entity_id,
        te.slug AS entity_slug,
        te.display_name AS entity_display_name,
        te.type AS entity_type,
        sph.match_confidence,
        sph.quarter,
        sph.is_promoter,
        CASE
          WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
            THEN ROUND((sph.shares::numeric * sqp.close_price) / 1e7, 2)
          ELSE NULL
        END AS market_value_cr
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN tracked_entities te ON te.id = sph.entity_id
      LEFT JOIN stock_quarter_prices sqp
        ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
      WHERE s.slug = ${stockSlug}
        AND sph.quarter = ${latestQ}::date
        AND sph.pct_of_company >= 1.0
      ORDER BY sph.pct_of_company DESC
    `) as Array<{
      id: number;
      stock_id: number;
      stock_name: string;
      stock_slug: string;
      holder_name: string;
      holder_type: string;
      shares: number | null;
      pct_of_company: string | null;
      entity_id: number | null;
      entity_slug: string | null;
      entity_display_name: string | null;
      entity_type: string | null;
      match_confidence: string | null;
      quarter: string;
      is_promoter: boolean;
      market_value_cr: string | null;
    }>;

    if (!holderRows.length && !summaryRow) return null;

    const mapped: OnePercentRow[] = holderRows.map((r) => ({
      id: r.id,
      stockId: r.stock_id,
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      holderName: r.entity_display_name || r.holder_name,
      holderType: r.is_promoter ? 'promoter' : (r.entity_type || r.holder_type),
      shares: toNum(r.shares),
      pctOfCompany: toNum(r.pct_of_company),
      entityId: r.entity_id != null ? Number(r.entity_id) : null,
      entitySlug: r.entity_slug ?? null,
      entityDisplayName: r.entity_display_name ?? null,
      entityType: r.entity_type ?? null,
      matchConfidence: r.match_confidence != null ? toNum(r.match_confidence) : null,
      quarter: quarterToIso(r.quarter),
      marketValueCr: toNum(r.market_value_cr),
    }));

    const buckets = bucketShpHolders(mapped);

    const summary: ShpCategorySummary = summaryRow
      ? {
          quarter: quarterToIso(summaryRow.quarter),
          promoterPct: toNum(summaryRow.promoter_pct),
          fiiPct: toNum(summaryRow.fii_pct),
          mfPct: toNum(summaryRow.mf_pct),
          diiExMfPct: toNum(summaryRow.dii_ex_mf_pct),
          publicPct: toNum(summaryRow.public_pct),
          individualsGte1Pct: toNum(summaryRow.individuals_gte1_pct),
          retailPct: toNum(summaryRow.retail_pct),
          totalPct: toNum(summaryRow.total_pct),
          sourceUrl: summaryRow.source_url,
          dataQuality: 'verified',
        }
      : {
          quarter: quarterToIso(latestQ),
          promoterPct: null,
          fiiPct: null,
          mfPct: null,
          diiExMfPct: null,
          publicPct: null,
          individualsGte1Pct: null,
          retailPct: null,
          totalPct: null,
          sourceUrl: null,
          dataQuality: 'holders_only',
        };

    return {
      stockName: stock.name,
      stockSlug: stock.slug,
      summary,
      ...buckets,
    };
  } catch {
    return null;
  }
}

/** All ≥1% non-promoter holders for one stock (latest quarter). */
export async function getOnePercentHoldersForStock(stockSlug: string): Promise<OnePercentRow[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      ),
      base AS (
        SELECT
          sph.id,
          s.id   AS stock_id,
          s.name AS stock_name,
          s.slug AS stock_slug,
          sph.holder_name,
          sph.holder_type,
          sph.shares,
          sph.pct_of_company,
          sph.entity_id,
          te.slug AS entity_slug,
          te.display_name AS entity_display_name,
          te.type AS entity_type,
          sph.match_confidence,
          sph.quarter,
          COALESCE(sqp.close_price, px.price_per_share) AS price_per_share,
          CASE
            WHEN sph.shares > 0 AND COALESCE(sqp.close_price, px.price_per_share) IS NOT NULL
              THEN ROUND((sph.shares::numeric * COALESCE(sqp.close_price, px.price_per_share)) / 1e7, 2)
            ELSE NULL
          END AS row_value_cr
        FROM shareholding_pattern_holders sph
        JOIN stocks s ON s.id = sph.stock_id
        LEFT JOIN tracked_entities te ON te.id = sph.entity_id
        LEFT JOIN stock_quarter_prices sqp
          ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
        LEFT JOIN LATERAL (
          SELECT (eh.market_value_cr * 1e7 / NULLIF(eh.shares_held, 0))::numeric AS price_per_share
          FROM entity_holdings eh
          WHERE eh.stock_id = sph.stock_id
            AND eh.quarter = sph.quarter
            AND eh.strategy_id IS NULL
            AND eh.market_value_cr > 0
            AND eh.shares_held > 0
          LIMIT 1
        ) px ON TRUE
        WHERE s.slug = ${stockSlug}
          AND sph.quarter = (SELECT q FROM latest)
          AND sph.is_promoter = FALSE
          AND sph.pct_of_company >= 1.0
      ),
      curated AS (
        SELECT
          MIN(b.id) AS id,
          b.stock_id,
          b.stock_name,
          b.stock_slug,
          COALESCE(MAX(b.entity_display_name), MAX(b.holder_name)) AS holder_name,
          COALESCE(MAX(b.entity_type), MAX(b.holder_type)) AS holder_type,
          SUM(b.shares)::bigint AS shares,
          SUM(b.pct_of_company)::numeric AS pct_of_company,
          b.entity_id,
          MAX(b.entity_slug) AS entity_slug,
          MAX(b.entity_display_name) AS entity_display_name,
          MAX(b.entity_type) AS entity_type,
          MAX(b.match_confidence) AS match_confidence,
          b.quarter,
          CASE
            WHEN SUM(b.shares) > 0 AND MAX(b.price_per_share) IS NOT NULL
              THEN ROUND((SUM(b.shares)::numeric * MAX(b.price_per_share)) / 1e7, 2)
            WHEN SUM(b.row_value_cr) IS NOT NULL
              THEN ROUND(SUM(COALESCE(b.row_value_cr, 0))::numeric, 2)
            ELSE NULL
          END AS market_value_cr,
          COUNT(*)::int AS filing_count,
          ARRAY_AGG(DISTINCT b.holder_name ORDER BY b.holder_name) AS filing_names
        FROM base b
        WHERE b.entity_id IS NOT NULL
        GROUP BY b.entity_id, b.stock_id, b.stock_name, b.stock_slug, b.quarter
      ),
      mystery AS (
        SELECT DISTINCT ON (
          b.stock_id,
          upper(regexp_replace(regexp_replace(trim(b.holder_name), '\\.+$', ''), '\\s+', ' ', 'g'))
        )
          b.id,
          b.stock_id,
          b.stock_name,
          b.stock_slug,
          b.holder_name,
          b.holder_type,
          b.shares,
          b.pct_of_company,
          b.entity_id,
          b.entity_slug,
          b.entity_display_name,
          b.entity_type,
          b.match_confidence,
          b.quarter,
          b.row_value_cr AS market_value_cr,
          1 AS filing_count,
          ARRAY[b.holder_name] AS filing_names
        FROM base b
        WHERE b.entity_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM base c
            WHERE c.entity_id IS NOT NULL
              AND c.stock_id = b.stock_id
              AND upper(regexp_replace(regexp_replace(trim(c.holder_name), '\\.+$', ''), '\\s+', ' ', 'g'))
                = upper(regexp_replace(regexp_replace(trim(b.holder_name), '\\.+$', ''), '\\s+', ' ', 'g'))
          )
        ORDER BY
          b.stock_id,
          upper(regexp_replace(regexp_replace(trim(b.holder_name), '\\.+$', ''), '\\s+', ' ', 'g')),
          b.pct_of_company DESC NULLS LAST,
          b.id DESC
      )
      SELECT * FROM curated
      UNION ALL
      SELECT * FROM mystery
      ORDER BY pct_of_company DESC
    `) as OnePercentRowDb[];
    return rows.map((r) => ({
      id: r.id,
      stockId: r.stock_id,
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      holderName: r.holder_name,
      holderType: r.entity_type || r.holder_type,
      shares: toNum(r.shares),
      pctOfCompany: toNum(r.pct_of_company),
      entityId: r.entity_id != null ? Number(r.entity_id) : null,
      entitySlug: r.entity_slug ?? null,
      entityDisplayName: r.entity_display_name ?? null,
      entityType: r.entity_type ?? null,
      matchConfidence: r.match_confidence != null ? toNum(r.match_confidence) : null,
      quarter: quarterToIso(r.quarter),
      marketValueCr: toNum(r.market_value_cr),
      filingNames: Array.isArray(r.filing_names) ? r.filing_names : undefined,
      filingCount: r.filing_count != null ? Number(r.filing_count) : undefined,
    }));
  } catch {
    return [];
  }
}

/** Stocks with SHP data for static paths — summary and/or ≥1% holders (latest quarter). */
export async function getOnePercentStockSlugs(): Promise<
  { slug: string; stockName: string; nseSymbol: string | null }[]
> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders
      )
      SELECT DISTINCT s.slug, s.name AS stock_name, s.nse_symbol
      FROM stocks s
      WHERE EXISTS (
        SELECT 1 FROM shareholding_pattern_holders sph
        WHERE sph.stock_id = s.id
          AND sph.quarter = (SELECT q FROM latest)
          AND sph.pct_of_company >= 1.0
      )
      OR EXISTS (
        SELECT 1 FROM stock_shp_summary ss
        WHERE ss.stock_id = s.id
          AND ss.quarter = (SELECT q FROM latest)
      )
      ORDER BY s.name
    `) as { slug: string; stock_name: string; nse_symbol: string | null }[];
    return rows.map((r) => ({
      slug: r.slug,
      stockName: r.stock_name,
      nseSymbol: r.nse_symbol ?? null,
    }));
  } catch {
    return [];
  }
}

interface EntityHoldingDbRow {
  stock_name: string;
  stock_slug: string;
  nse_symbol: string | null;
  isin: string | null;
  bse_code: string | null;
  shares_held: number | null;
  pct_of_company: number | null;
  market_value_cr: number | null;
  change_type: string | null;
  pct_change: number | null;
  prev_pct: number | null;
  quarter: string | null;
}
interface HolderStockDbRow {
  stock_name: string;
  stock_slug: string;
  nse_symbol?: string | null;
  isin?: string | null;
  bse_code?: string | null;
  pct_of_company: number | null;
  shares: number | null;
  market_value_cr: unknown;
  holder_type: string;
  entity_slug: string | null;
}
interface OnePercentSnapshotRow {
  latest_quarter: string | null;
  total_rows: number | null;
  distinct_holders: number | null;
  distinct_stocks: number | null;
  unmatched_pct: number | null;
}
interface OnePercentStockAggRow {
  stock_id: number;
  stock_name: string;
  stock_slug: string;
  holders: number | bigint;
  top_pct: number | null;
  total_value_cr: string | null;
}
interface OnePercentRowDb {
  id: number;
  stock_id: number;
  stock_name: string;
  stock_slug: string;
  holder_name: string;
  holder_type: string;
  shares: number | null;
  pct_of_company: number | null;
  entity_id: number | null;
  entity_slug: string | null;
  entity_display_name: string | null;
  entity_type: string | null;
  match_confidence: number | null;
  quarter: string | null;
  market_value_cr: number | null;
  filing_count?: number | null;
  filing_names?: string[] | null;
}

// ─── Formatting helpers ──────────────────────────────────────────

/** Coerce Neon/pg numeric strings to number (driver often returns NUMERIC as string). */
export function toNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** PG DATE values from Neon arrive as UTC instants; use IST calendar date (India listings). */
function toIstCalendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : '';
}

/** Normalize PG DATE / ISO string from Neon (Date objects stringify to "Wed Apr 01 2026…"). */
export function quarterToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIstCalendarDate(value) || null;
  }
  const s = String(value);
  if (s.includes('T')) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return toIstCalendarDate(d) || null;
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

export function formatCr(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n == null || n === 0) return '—';
  if (n >= 1000) return `₹${(n / 1000).toFixed(2)}k Cr`;
  if (n < 1 && n > 0) return `₹${(n * 100).toFixed(1)} L`;
  return `₹${n.toFixed(1)} Cr`;
}

export function formatPct(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}

/** Compact percentage-point QoQ label for tables. */
export function formatPctPoints(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}pp`;
}

export interface QoQDisplay {
  label: string;
  hint: string;
  tone: 'new' | 'exit' | 'up' | 'down' | 'flat' | 'none';
}

export function formatQoQDisplay(row: {
  changeType: string | null;
  pctChange: number | null;
  prevPct: number | null;
  newPct?: number | null;
  pctOfCompany?: number | null;
}): QoQDisplay {
  const type = row.changeType;
  const prev = row.prevPct;
  const curr = row.newPct ?? row.pctOfCompany ?? null;
  const delta = row.pctChange;

  if (!type || type === 'unchanged') {
    return { label: 'No change', hint: curr != null ? `${formatPct(curr)} held` : 'Unchanged vs prior quarter', tone: 'flat' };
  }
  if (type === 'fresh_entry') {
    return { label: 'New', hint: curr != null ? `Entered at ${formatPct(curr)}` : 'New position this quarter', tone: 'new' };
  }
  if (type === 'complete_exit') {
    return {
      label: '< 1%',
      hint:
        prev != null
          ? `No longer in SHP (below 1% threshold). Was ${formatPct(prev)} last quarter — may still hold a smaller undisclosed stake.`
          : 'No longer in quarterly SHP (below 1% disclosure threshold)',
      tone: 'exit',
    };
  }
  if (type === 'increased') {
    const pts = formatPctPoints(delta);
    return {
      label: pts,
      hint: prev != null && curr != null ? `${formatPct(prev)} → ${formatPct(curr)}` : 'Stake increased',
      tone: 'up',
    };
  }
  if (type === 'decreased') {
    const pts = formatPctPoints(delta);
    return {
      label: pts,
      hint: prev != null && curr != null ? `${formatPct(prev)} → ${formatPct(curr)}` : 'Stake trimmed',
      tone: 'down',
    };
  }
  return { label: type, hint: '', tone: 'none' };
}

/** Calendar quarter start months stored in DB (Jan/Apr/Jul/Oct → Mar/Jun/Sep/Dec end labels). */
const QUARTER_START_MONTHS = new Set([1, 4, 7, 10]);

export function formatQuarter(iso: string | null | undefined): string {
  if (!iso) return '—';
  const normalized = quarterToIso(iso) ?? iso;
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = parseInt(m[1], 10);
    const startMonth = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    // SHP filings are labeled by quarter-end (Mar/Jun/Sep/Dec), not quarter-start.
    if (day === 1 && QUARTER_START_MONTHS.has(startMonth)) {
      const endMonth = startMonth + 2;
      return `${monthNames[endMonth - 1]} ${year}`;
    }
    if (startMonth >= 1 && startMonth <= 12) return `${monthNames[startMonth - 1]} ${year}`;
  }
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return String(iso);
  const month = d.toLocaleString('en-IN', { month: 'short' });
  return `${month} ${d.getFullYear()}`;
}

/** Curated super investors with ≥1% stake on one stock (for cross-links). */
export async function getCuratedInvestorsForStock(
  stockSlug: string,
): Promise<Array<{ slug: string; name: string; pct: number | null }>> {
  const holders = await getOnePercentHoldersForStock(stockSlug);
  return holders
    .filter((h) => h.entitySlug)
    .map((h) => ({
      slug: h.entitySlug!,
      name: h.holderName,
      pct: h.pctOfCompany,
    }));
}

/** SEO title + description for a super-investor profile page. */
export function buildInvestorPageSeo(
  displayName: string,
  live: EntityLiveStats | undefined,
  holdings: EntityHoldingRow[],
): { title: string; description: string } {
  const quarter = holdings[0]?.quarter ?? live?.quarter ?? null;
  const qLabel = quarter ? formatQuarter(quarter) : null;
  const holdingsN = holdings.length > 0 ? holdings.length : (live?.totalHoldings ?? 0);
  const holdingsValueTotal = holdings.reduce((sum, h) => sum + (h.marketValueCr ?? 0), 0);
  const valueCr =
    holdings.length > 0 && holdingsValueTotal > 0
      ? holdingsValueTotal
      : live?.portfolioValueCr;

  const title = qLabel
    ? `${displayName} Portfolio & Holdings ${qLabel} | IPOFins`
    : `${displayName} Portfolio & Shareholdings | IPOFins`;

  const valuePart =
    valueCr != null && valueCr > 0 ? `${formatCr(valueCr)} disclosed` : 'latest NSE/BSE filings';
  const description = `${displayName} portfolio${qLabel ? ` (${qLabel})` : ''} — ${holdingsN} stock${holdingsN === 1 ? '' : 's'}, ${valuePart}. Quarter-on-quarter adds, exits, and stake changes from shareholding pattern filings.`;

  return { title, description };
}

/** SEO title + description for a 1% Club stock page. */
export function buildOnePercentStockSeo(
  stockName: string,
  holders: OnePercentRow[],
  curatedCount: number,
  mysteryCount: number,
): { title: string; description: string } {
  const quarter = holders[0]?.quarter ?? null;
  const qLabel = quarter ? formatQuarter(quarter) : null;
  const title = qLabel
    ? `${stockName} ≥1% Shareholders ${qLabel} | IPOFins`
    : `${stockName} ≥1% Shareholders & Smart Money | IPOFins`;

  const description = qLabel
    ? `${stockName} shareholders owning 1%+ (${qLabel} SHP) — ${holders.length} holders (${curatedCount} curated super investors, ${mysteryCount} mystery). Mutual fund activity and institutional stakes from official filings.`
    : `Every non-promoter shareholder owning 1%+ of ${stockName} from the latest shareholding pattern. ${curatedCount} curated, ${mysteryCount} mystery holders.`;

  return { title, description };
}
