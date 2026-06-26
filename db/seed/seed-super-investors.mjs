#!/usr/bin/env node
/**
 * Seed curated super-investor / PMS / AIF / SIF entities into Neon.
 *
 * Reads:
 *   src/data/super-investors.json      (individuals, family offices, FII, DII)
 *   src/data/pms-providers.json        (PMS providers + strategies)
 *   src/data/alternative-funds.json    (AIF Cat-I/II/III + SIF + strategies)
 *
 * Writes to:
 *   tracked_entities         (one row per entity)
 *   tracked_entity_tags      (many-to-many style tags)
 *   entity_strategies        (PMS/SIF strategies)
 *
 * Idempotent: upserts on `slug`. Safe to re-run after editing the JSON rosters.
 * No existing 001/004 tables are touched — pure additive seed.
 *
 * Usage: node scripts/node-with-ca.mjs db/seed/seed-super-investors.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'src', 'data');

const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(dbUrl);

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

function readJSON(file) {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Normalize one JSON record to the tracked_entities column shape.
// Unrecognized fields are dropped silently so the JSON can carry notes.
function toEntity(rec, defaultType) {
  return {
    name: rec.name,
    slug: rec.slug || slugify(rec.name),
    display_name: rec.displayName || rec.name,
    type: rec.type || defaultType,
    tier: rec.tier || null,
    aliases: Array.isArray(rec.aliases) ? rec.aliases : [],
    focus: rec.focus || null,
    bio: rec.bio || null,
    location: rec.location || null,
    website: rec.website || null,
    photo: rec.photo || null,
    registration_id: rec.registrationId || null,
    aum_cr: rec.aumCr ?? null,
    fee_structure: rec.feeStructure || null,
    parent_org: rec.parentOrg || null,
    tracked_since: rec.trackedSince || null,
    is_active: rec.isActive ?? true,
  };
}

async function upsertEntity(rec, defaultType) {
  const e = toEntity(rec, defaultType);
  const row = await sql`
    INSERT INTO tracked_entities (
      name, slug, display_name, type, tier, aliases, focus, bio, location,
      website, photo, registration_id, aum_cr, fee_structure, parent_org,
      tracked_since, is_active, updated_at
    ) VALUES (
      ${e.name}, ${e.slug}, ${e.display_name}, ${e.type}, ${e.tier}, ${e.aliases},
      ${e.focus}, ${e.bio}, ${e.location}, ${e.website}, ${e.photo},
      ${e.registration_id}, ${e.aum_cr}, ${e.fee_structure}, ${e.parent_org},
      ${e.tracked_since}, ${e.is_active}, NOW()
    )
    ON CONFLICT (slug) DO UPDATE SET
      name             = EXCLUDED.name,
      display_name     = EXCLUDED.display_name,
      type             = EXCLUDED.type,
      tier             = EXCLUDED.tier,
      aliases          = EXCLUDED.aliases,
      focus            = EXCLUDED.focus,
      bio              = EXCLUDED.bio,
      location         = EXCLUDED.location,
      website          = EXCLUDED.website,
      photo            = EXCLUDED.photo,
      registration_id  = EXCLUDED.registration_id,
      aum_cr           = EXCLUDED.aum_cr,
      fee_structure    = EXCLUDED.fee_structure,
      parent_org       = EXCLUDED.parent_org,
      tracked_since    = EXCLUDED.tracked_since,
      is_active        = EXCLUDED.is_active,
      updated_at       = NOW()
    RETURNING id, slug, type
  `;
  return row[0];
}

async function upsertTags(entityId, tags) {
  if (!Array.isArray(tags) || !tags.length) return 0;
  for (const tag of tags) {
    await sql`
      INSERT INTO tracked_entity_tags (entity_id, tag)
      VALUES (${entityId}, ${tag})
      ON CONFLICT (entity_id, tag) DO NOTHING
    `;
  }
  return tags.length;
}

async function upsertStrategies(entityId, strategies) {
  if (!Array.isArray(strategies) || !strategies.length) return 0;
  let count = 0;
  for (const s of strategies) {
    const slug = slugify(`${s.name}-${entityId}`);
    await sql`
      INSERT INTO entity_strategies (entity_id, name, slug, strategy_type, min_ticket_cr, description)
      VALUES (${entityId}, ${s.name}, ${slug}, ${s.strategyType || null}, ${s.minTicketCr ?? null}, ${s.description || null})
      ON CONFLICT (slug) DO UPDATE SET
        entity_id      = EXCLUDED.entity_id,
        name           = EXCLUDED.name,
        strategy_type  = EXCLUDED.strategy_type,
        min_ticket_cr  = EXCLUDED.min_ticket_cr,
        description    = EXCLUDED.description
    `;
    count++;
  }
  return count;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Seed Tracked Entities (Super Investors / PMS / AIF / SIF)');
  console.log('═══════════════════════════════════════════════════════════');

  const superInvestors = readJSON('super-investors.json');
  const pmsProviders    = readJSON('pms-providers.json');
  const altFunds        = readJSON('alternative-funds.json');

  console.log(`  Source rosters — super-investors: ${superInvestors.length}, PMS: ${pmsProviders.length}, alt-funds: ${altFunds.length}`);

  let entityCount = 0;
  let tagCount = 0;
  let strategyCount = 0;

  // ─── Super Investors (individual / family_office / fii / dii) ───
  for (const rec of superInvestors) {
    const row = await upsertEntity(rec);
    entityCount++;
    tagCount += await upsertTags(row.id, rec.tags);
    strategyCount += await upsertStrategies(row.id, rec.strategies);
  }
  console.log(`  ✅ Super-investors: ${superInvestors.length} entities`);

  // ─── PMS providers ───
  for (const rec of pmsProviders) {
    const row = await upsertEntity(rec, 'pms');
    entityCount++;
    tagCount += await upsertTags(row.id, rec.tags);
    strategyCount += await upsertStrategies(row.id, rec.strategies);
  }
  console.log(`  ✅ PMS providers: ${pmsProviders.length} entities`);

  // ─── AIF + SIF (one vertical, two tabs) ───
  for (const rec of altFunds) {
    const row = await upsertEntity(rec);
    entityCount++;
    tagCount += await upsertTags(row.id, rec.tags);
    strategyCount += await upsertStrategies(row.id, rec.strategies);
  }
  console.log(`  ✅ Alternative funds (AIF + SIF): ${altFunds.length} entities`);

  // ─── Sanity report ───
  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM tracked_entities)         AS total,
      (SELECT COUNT(*)::int FROM tracked_entity_tags)      AS tags,
      (SELECT COUNT(*)::int FROM entity_strategies)        AS strategies,
      (SELECT COUNT(*)::int FROM tracked_entities WHERE type = 'individual')     AS individuals,
      (SELECT COUNT(*)::int FROM tracked_entities WHERE type = 'family_office')  AS family_office,
      (SELECT COUNT(*)::int FROM tracked_entities WHERE type = 'fii')            AS fii,
      (SELECT COUNT(*)::int FROM tracked_entities WHERE type = 'dii')            AS dii,
      (SELECT COUNT(*)::int FROM tracked_entities WHERE type = 'pms')            AS pms,
      (SELECT COUNT(*)::int FROM tracked_entities WHERE type = 'aif')            AS aif,
      (SELECT COUNT(*)::int FROM tracked_entities WHERE type = 'sif')            AS sif
  `;

  console.log('\nRow counts:');
  console.log(`  Total entities:   ${stats.total}`);
  console.log(`  ├─ individuals:   ${stats.individuals}`);
  console.log(`  ├─ family_office: ${stats.family_office}`);
  console.log(`  ├─ fii:           ${stats.fii}`);
  console.log(`  ├─ dii:           ${stats.dii}`);
  console.log(`  ├─ pms:           ${stats.pms}`);
  console.log(`  ├─ aif:           ${stats.aif}`);
  console.log(`  └─ sif:           ${stats.sif}`);
  console.log(`  Tags:             ${stats.tags}`);
  console.log(`  Strategies:       ${stats.strategies}`);

  console.log('\n✅ Seed complete (idempotent — safe to re-run after editing rosters)');
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
