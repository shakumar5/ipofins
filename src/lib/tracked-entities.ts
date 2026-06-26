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
    const key = stockCanonicalKey(row.nseSymbol, row.stockSlug);
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
      WITH latest AS (
        SELECT MAX(quarter) AS q FROM entity_holdings WHERE strategy_id IS NULL
      ),
      holdings AS (
        SELECT DISTINCT ON (eh.entity_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug))
          eh.entity_id,
          eh.stock_id,
          eh.shares_held,
          eh.pct_of_company,
          eh.market_value_cr,
          eh.quarter
        FROM entity_holdings eh
        JOIN stocks s ON s.id = eh.stock_id
        WHERE eh.strategy_id IS NULL
          AND eh.quarter = (SELECT q FROM latest)
        ORDER BY eh.entity_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug), eh.pct_of_company DESC NULLS LAST, eh.id DESC
      )
      SELECT
        s.name AS stock_name,
        s.slug AS stock_slug,
        s.nse_symbol,
        h.shares_held,
        h.pct_of_company,
        h.market_value_cr,
        ch.change_type,
        ch.pct_change,
        ch.prev_pct,
        h.quarter
      FROM holdings h
      JOIN tracked_entities te ON te.id = h.entity_id
      JOIN stocks s ON s.id = h.stock_id
      LEFT JOIN LATERAL (
        SELECT
          ec.change_type,
          ec.pct_change,
        CASE
          WHEN ec.change_type = 'fresh_entry' THEN 0::numeric
          WHEN ec.change_type = 'complete_exit' THEN prev_eh.pct_of_company
          ELSE COALESCE(prev_eh.pct_of_company, GREATEST(0, COALESCE(h.pct_of_company, 0) - COALESCE(ec.pct_change, 0)))
        END AS prev_pct
        FROM entity_changes ec
        LEFT JOIN entity_holdings prev_eh
          ON prev_eh.entity_id = ec.entity_id
         AND prev_eh.stock_id = ec.stock_id
         AND prev_eh.quarter = ec.prev_quarter
         AND prev_eh.strategy_id IS NULL
        WHERE ec.entity_id = h.entity_id
          AND ec.stock_id = h.stock_id
          AND ec.strategy_id IS NULL
          AND ec.quarter = h.quarter
        LIMIT 1
      ) ch ON TRUE
      WHERE te.slug = ${entitySlug}
      ORDER BY h.pct_of_company DESC NULLS LAST, h.market_value_cr DESC NULLS LAST
    `) as EntityHoldingDbRow[];
    return rows.map((r) => ({
      stockName: r.stock_name,
      stockSlug: r.stock_slug,
      nseSymbol: r.nse_symbol ?? null,
      shares: toNum(r.shares_held),
      pctOfCompany: toNum(r.pct_of_company),
      marketValueCr: toNum(r.market_value_cr),
      changeType: r.change_type ?? null,
      pctChange: toNum(r.pct_change),
      prevPct: toNum(r.prev_pct),
      quarter: quarterToIso(r.quarter),
    }));
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
      SELECT DISTINCT ON (ec.entity_id, ec.quarter, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug))
        ec.quarter,
        ec.prev_quarter,
        ec.change_type,
        ec.pct_change,
        s.name AS stock_name,
        s.slug AS stock_slug,
        s.nse_symbol,
        COALESCE(curr.pct_of_company, CASE WHEN ec.change_type = 'complete_exit' THEN 0 END) AS new_pct,
        CASE
          WHEN ec.change_type = 'fresh_entry' THEN 0::numeric
          WHEN ec.change_type = 'complete_exit' THEN prev_eh.pct_of_company
          ELSE COALESCE(prev_eh.pct_of_company, GREATEST(0, COALESCE(curr.pct_of_company, 0) - COALESCE(ec.pct_change, 0)))
        END AS prev_pct,
        curr.market_value_cr AS new_value_cr,
        prev_eh.market_value_cr AS prev_value_cr
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
      WHERE te.slug = ${entitySlug}
        AND ec.strategy_id IS NULL
        AND ec.quarter = ANY(${quarters}::date[])
      ORDER BY ec.entity_id, ec.quarter, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug),
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

    return quarters
      .map((q) => byQuarter.get(q))
      .filter((d): d is EntityQuarterChangeDetail => !!d);
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
        eqs.total_holdings,
        eqs.portfolio_value_cr,
        mov.fresh_entries,
        mov.adds,
        mov.exits,
        mov.trims
      FROM tracked_entities te
      JOIN entity_quarterly_stats eqs
        ON eqs.entity_id = te.id AND eqs.strategy_id IS NULL
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE ec.change_type = 'fresh_entry')   AS fresh_entries,
          COUNT(*) FILTER (WHERE ec.change_type = 'increased')     AS adds,
          COUNT(*) FILTER (WHERE ec.change_type = 'complete_exit') AS exits,
          COUNT(*) FILTER (WHERE ec.change_type = 'decreased')     AS trims
        FROM entity_changes ec
        WHERE ec.entity_id = te.id
          AND ec.strategy_id IS NULL
          AND ec.quarter = eqs.quarter
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
      latestQuarter: quarterToIso(r?.latest_quarter),
    };
  } catch {
    return base;
  }
}

// ─── URL helpers ──────────────────────────────────────────────────

export const SUPER_INVESTORS_HUB = '/super-investors';
export const ONE_PERCENT_CLUB_HUB = '/1-percent-club';

/** Mystery holder result pages with fewer stocks are thin — noindex, omit from sitemap. */
export const HOLDER_PAGE_MIN_INDEXABLE_STOCKS = 2;

export function isHolderPageIndexable(stockCount: number): boolean {
  return stockCount >= HOLDER_PAGE_MIN_INDEXABLE_STOCKS;
}

/** Holder static paths are opt-in — tens of thousands of pages, each was re-scanning all holders. */
export function shouldBuildHolderPages(): boolean {
  return process.env.SI_BUILD_HOLDER_PAGES === '1';
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
      )
      SELECT
        sph.holder_name,
        MAX(te.slug) AS entity_slug,
        COUNT(DISTINCT sph.stock_id)::int AS stock_count
      FROM shareholding_pattern_holders sph
      LEFT JOIN tracked_entities te ON te.id = sph.entity_id
      WHERE sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      GROUP BY sph.holder_name
      ORDER BY sph.holder_name
    `) as { holder_name: string; entity_slug: string | null; stock_count: number }[];
    return rows.map((r) => ({
      holderSlug: slugifyEntity(r.holder_name),
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
    holderType: string;
  }>;
}> {
  if (!sql) return { holderName: holderSlug, entitySlug: null, rows: [] };
  try {
    let holderName = knownHolder?.holderName;
    let entitySlug = knownHolder?.entitySlug ?? null;
    if (!holderName) {
      const holders = await getDistinctHolderSlugs();
      const match = holders.find((h) => h.holderSlug === holderSlug);
      if (!match) return { holderName: holderSlug, entitySlug: null, rows: [] };
      holderName = match.holderName;
      entitySlug = match.entitySlug;
    }

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
      WHERE sph.holder_name = ${holderName}
        AND sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
      ORDER BY sph.pct_of_company DESC
    `) as HolderStockDbRow[];

    return {
      holderName,
      entitySlug: entitySlug ?? rows[0]?.entity_slug ?? null,
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
          px.price_per_share,
          CASE
            WHEN sph.shares > 0 AND px.price_per_share IS NOT NULL
              THEN ROUND((sph.shares::numeric * px.price_per_share) / 1e7, 2)
            ELSE NULL
          END AS row_value_cr
        FROM shareholding_pattern_holders sph
        JOIN stocks s ON s.id = sph.stock_id
        LEFT JOIN tracked_entities te ON te.id = sph.entity_id
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
          COALESCE(b.entity_display_name, MAX(b.holder_name)) AS holder_name,
          COALESCE(b.entity_type, MAX(b.holder_type)) AS holder_type,
          SUM(b.shares)::bigint AS shares,
          SUM(b.pct_of_company)::numeric AS pct_of_company,
          b.entity_id,
          b.entity_slug,
          b.entity_display_name,
          b.entity_type,
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
        GROUP BY
          b.entity_id, b.stock_id, b.stock_name, b.stock_slug,
          b.entity_slug, b.entity_display_name, b.entity_type, b.quarter
      ),
      mystery AS (
        SELECT DISTINCT ON (
          b.stock_id,
          lower(regexp_replace(trim(b.holder_name), '\\s+', ' ', 'g'))
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
        ORDER BY
          b.stock_id,
          lower(regexp_replace(trim(b.holder_name), '\\s+', ' ', 'g')),
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
  pct_change: number | null;
  prev_pct: number | null;
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

/** Normalize PG DATE / ISO string from Neon (Date objects stringify to "Wed Apr 01 2026…"). */
export function quarterToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

export function formatCr(value: number | string | null | undefined): string {
  const n = toNum(value);
  if (n == null) return '—';
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
  const holdingsN = live?.totalHoldings ?? holdings.length;
  const valueCr = live?.portfolioValueCr;

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
