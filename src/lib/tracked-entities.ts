/**
 * Tracked Entities — Super Investors + 1% Club (v1)
 *
 *   /super-investors    curated roster (30) + quarterly holdings
 *   /1-percent-club     raw ≥1% holders per stock + name search
 */

import superInvestorsJson from '../data/super-investors.json';
import { sql } from './db';
import { BRAND_URL } from './brand';

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
  quarter: string | null;
}

/** Latest-quarter holdings for a curated super investor. */
export async function getEntityHoldings(entitySlug: string): Promise<EntityHoldingRow[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM entity_holdings WHERE strategy_id IS NULL
      )
      SELECT
        s.name AS stock_name,
        s.slug AS stock_slug,
        s.nse_symbol,
        eh.shares_held,
        eh.pct_of_company,
        eh.market_value_cr,
        ec.change_type,
        eh.quarter
      FROM entity_holdings eh
      JOIN tracked_entities te ON te.id = eh.entity_id
      JOIN stocks s ON s.id = eh.stock_id
      LEFT JOIN entity_changes ec
        ON ec.entity_id = eh.entity_id
       AND ec.stock_id = eh.stock_id
       AND ec.strategy_id IS NULL
       AND ec.quarter = eh.quarter
      WHERE te.slug = ${entitySlug}
        AND eh.strategy_id IS NULL
        AND eh.quarter = (SELECT q FROM latest)
      ORDER BY eh.market_value_cr DESC NULLS LAST, eh.pct_of_company DESC NULLS LAST
    `) as EntityHoldingDbRow[];
    return rows.map((r) => ({
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      nseSymbol: r.nse_symbol ?? null,
      shares: r.shares_held ?? null,
      pctOfCompany: r.pct_of_company ?? null,
      marketValueCr: r.market_value_cr ?? null,
      changeType: r.change_type ?? null,
      quarter: r.quarter ? String(r.quarter).slice(0, 10) : null,
    }));
  } catch {
    return [];
  }
}

// ─── Neon enrichment (migration 005 — optional) ──────────────────
//
// Wrapped in try/catch + a feature check so the static build never hard-fails
// when the 005 tables are absent or empty. Mirrors the graceful-skip contract
// in db/verify-schema.mjs.

let liveStatsCache: Map<string, EntityLiveStats> | null = null;

async function loadLiveStats(): Promise<Map<string, EntityLiveStats>> {
  if (liveStatsCache) return liveStatsCache;
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
        eqs.total_holdings,
        eqs.portfolio_value_cr,
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
          COUNT(*) FILTER (WHERE ec.change_type = 'fresh_entry')   AS fresh_entries,
          COUNT(*) FILTER (WHERE ec.change_type = 'complete_exit') AS exits,
          COUNT(*) FILTER (WHERE ec.change_type = 'increased')     AS adds,
          COUNT(*) FILTER (WHERE ec.change_type = 'decreased')     AS trims
        FROM entity_changes ec
        WHERE ec.entity_id = te.id AND ec.strategy_id IS NULL
          AND ec.quarter = (SELECT q FROM latest)
      ) mov ON TRUE
    `) as EntityStatsRow[];
    for (const r of rows) {
      map.set(r.slug, {
        quarter: r.quarter ? String(r.quarter).slice(0, 10) : null,
        totalHoldings: r.total_holdings ?? null,
        portfolioValueCr: r.portfolio_value_cr ?? null,
        top5Concentration: r.top5_concentration ?? null,
        largeCapPct: r.large_cap_pct ?? null,
        midCapPct: r.mid_cap_pct ?? null,
        smallCapPct: r.small_cap_pct ?? null,
        freshEntries: r.fresh_entries ?? null,
        exits: r.exits ?? null,
        adds: r.adds ?? null,
        trims: r.trims ?? null,
      });
    }
  } catch {
    // 005 tables absent or query failed — fall back to static-only cards.
  }
  liveStatsCache = map;
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
      SELECT
        (SELECT COUNT(DISTINCT stock_id) FROM entity_holdings)               AS stocks_held,
        (SELECT SUM(portfolio_value_cr) FROM entity_quarterly_stats
          WHERE strategy_id IS NULL
            AND quarter = (SELECT MAX(quarter) FROM entity_quarterly_stats)) AS total_value_cr,
        (SELECT MAX(quarter)::text FROM entity_quarterly_stats)              AS latest_quarter
    `) as SnapshotRow[];
    const r = rows[0];
    return {
      ...base,
      stocksHeld: r?.stocks_held ?? null,
      totalValueCr: r?.total_value_cr ?? null,
      latestQuarter: r?.latest_quarter ? String(r.latest_quarter).slice(0, 10) : null,
    };
  } catch {
    return base;
  }
}

// ─── URL helpers ──────────────────────────────────────────────────

export const SUPER_INVESTORS_HUB = '/super-investors';
export const ONE_PERCENT_CLUB_HUB = '/1-percent-club';

export function superInvestorUrl(slug: string): string {
  return `${SUPER_INVESTORS_HUB}/${slug}`;
}
export function onePercentStockUrl(slug: string): string {
  return `${ONE_PERCENT_CLUB_HUB}/${slug}`;
}
export function onePercentHolderUrl(holderSlug: string): string {
  return `${ONE_PERCENT_CLUB_HUB}/holder/${holderSlug}`;
}

/** Link curated holder to super-investor profile (v1: all curated entities are super investors). */
export function curatedEntityUrl(entitySlug: string | null | undefined): string | null {
  if (!entitySlug) return null;
  return superInvestorUrl(entitySlug);
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
  matchConfidence: number | null;
  quarter: string | null;
}

export interface OnePercentStockAgg {
  stockId: number;
  stockName: string;
  stockSlug: string;
  holders: number;
  curatedCount: number;        // how many resolved to a tracked entity
  mysteryCount: number;        // unresolved ≥1% holders
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
      latestQuarter: r?.latest_quarter ? String(r.latest_quarter).slice(0, 10) : null,
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
export async function getDistinctHolderSlugs(): Promise<{ holderSlug: string; holderName: string; entitySlug: string | null }[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      )
      SELECT
        sph.holder_name,
        MAX(te.slug) AS entity_slug
      FROM shareholding_pattern_holders sph
      LEFT JOIN tracked_entities te ON te.id = sph.entity_id
      WHERE sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      GROUP BY sph.holder_name
      ORDER BY sph.holder_name
    `) as { holder_name: string; entity_slug: string | null }[];
    return rows.map((r) => ({
      holderSlug: slugifyEntity(r.holder_name),
      holderName: r.holder_name,
      entitySlug: r.entity_slug,
    }));
  } catch {
    return [];
  }
}

/** All ≥1% positions for a holder name slug (latest quarter). */
export async function getHoldingsByHolderSlug(holderSlug: string): Promise<{
  holderName: string;
  entitySlug: string | null;
  rows: Array<{
    stockName: string;
    stockSlug: string;
    pctOfCompany: number | null;
    shares: number | null;
    holderType: string;
  }>;
}> {
  if (!sql) return { holderName: holderSlug, entitySlug: null, rows: [] };
  try {
    const holders = await getDistinctHolderSlugs();
    const match = holders.find((h) => h.holderSlug === holderSlug);
    if (!match) return { holderName: holderSlug, entitySlug: null, rows: [] };

    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      )
      SELECT
        s.name AS stock_name,
        s.slug AS stock_slug,
        sph.pct_of_company,
        sph.shares,
        sph.holder_type,
        te.slug AS entity_slug
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN tracked_entities te ON te.id = sph.entity_id
      WHERE sph.holder_name = ${match.holderName}
        AND sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      ORDER BY sph.pct_of_company DESC
    `) as HolderStockDbRow[];

    return {
      holderName: match.holderName,
      entitySlug: match.entitySlug ?? rows[0]?.entity_slug ?? null,
      rows: rows.map((r) => ({
        stockName: r.stock_name,
        stockSlug: r.stock_slug,
        pctOfCompany: r.pct_of_company ?? null,
        shares: r.shares ?? null,
        holderType: r.holder_type,
      })),
    };
  } catch {
    return { holderName: holderSlug, entitySlug: null, rows: [] };
  }
}

/** Build client search index at page build time. */
export async function getOnePercentSearchIndex(): Promise<{
  stocks: { slug: string; name: string }[];
  holders: { slug: string; name: string; entitySlug: string | null }[];
}> {
  const [stocks, holders] = await Promise.all([
    getOnePercentStockSlugs(),
    getDistinctHolderSlugs(),
  ]);
  return {
    stocks: stocks.map((s) => ({ slug: s.slug, name: s.stockName })),
    holders: holders.map((h) => ({
      slug: h.holderSlug,
      name: h.holderName,
      entitySlug: h.entitySlug,
    })),
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
        COUNT(sph.entity_id)                                AS curated_count,
        COUNT(*) FILTER (WHERE sph.entity_id IS NULL)       AS mystery_count,
        MAX(sph.pct_of_company)                             AS top_pct
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      WHERE sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      GROUP BY s.id, s.name, s.slug
      ORDER BY holders DESC, mystery_count DESC
      LIMIT ${limit}
    `) as OnePercentStockAggRow[];
    return rows.map((r) => ({
      stockId: r.stock_id,
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      holders: Number(r.holders),
      curatedCount: Number(r.curated_count),
      mysteryCount: Number(r.mystery_count),
      topPct: r.top_pct ?? null,
    }));
  } catch {
    return [];
  }
}

/** All ≥1% non-promoter holders for one stock (latest quarter). */
export async function getOnePercentHoldersForStock(stockSlug: string): Promise<OnePercentRow[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      )
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
        sph.match_confidence,
        sph.quarter
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN tracked_entities te ON te.id = sph.entity_id
      WHERE s.slug = ${stockSlug}
        AND sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      ORDER BY sph.pct_of_company DESC
    `) as OnePercentRowDb[];
    return rows.map((r) => ({
      id: r.id,
      stockId: r.stock_id,
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      holderName: r.holder_name,
      holderType: r.holder_type,
      shares: r.shares ?? null,
      pctOfCompany: r.pct_of_company ?? null,
      entityId: r.entity_id ?? null,
      entitySlug: r.entity_slug ?? null,
      matchConfidence: r.match_confidence ?? null,
      quarter: r.quarter ? String(r.quarter).slice(0, 10) : null,
    }));
  } catch {
    return [];
  }
}

/** Slugs of stocks that have at least one ≥1% non-promoter holder (for getStaticPaths). */
export async function getOnePercentStockSlugs(): Promise<{ slug: string; stockName: string }[]> {
  if (!sql) return [];
  try {
    const rows = (await sql!`
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      )
      SELECT DISTINCT s.slug, s.name AS stock_name
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      WHERE sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      ORDER BY s.name
    `) as { slug: string; stock_name: string }[];
    return rows.map((r) => ({ slug: r.slug, stockName: r.stock_name }));
  } catch {
    return [];
  }
}

interface EntityHoldingDbRow {
  stock_name: string;
  stock_slug: string;
  nse_symbol: string | null;
  shares_held: number | null;
  pct_of_company: number | null;
  market_value_cr: number | null;
  change_type: string | null;
  quarter: string | null;
}
interface HolderStockDbRow {
  stock_name: string;
  stock_slug: string;
  pct_of_company: number | null;
  shares: number | null;
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
  curated_count: number | bigint;
  mystery_count: number | bigint;
  top_pct: number | null;
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
  match_confidence: number | null;
  quarter: string | null;
}

// ─── Formatting helpers ──────────────────────────────────────────

export function formatCr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `₹${(value / 1000).toFixed(2)}k Cr`;
  return `₹${value.toFixed(1)} Cr`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

export function formatQuarter(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleString('en-IN', { month: 'short' });
  return `${month} ${d.getFullYear()}`;
}
