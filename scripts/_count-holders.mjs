import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;
const [{ all_holders }] = await sql`
  WITH latest AS (SELECT MAX(quarter) AS q FROM shareholding_pattern_holders)
  SELECT COUNT(DISTINCT ${sql.unsafe("upper(regexp_replace(regexp_replace(trim(sph.holder_name), '\\.+$', ''), '\\s+', ' ', 'g'))")})::int AS all_holders
  FROM shareholding_pattern_holders sph WHERE sph.quarter=(SELECT q FROM latest) AND sph.pct_of_company>=1.0`;
const [{ promoters }] = await sql`
  WITH latest AS (SELECT MAX(quarter) AS q FROM shareholding_pattern_holders)
  SELECT COUNT(DISTINCT holder_name)::int AS promoters FROM shareholding_pattern_holders sph
  WHERE sph.quarter=(SELECT q FROM latest) AND sph.pct_of_company>=1.0 AND sph.is_promoter=true`;
console.log('latest', latest, 'distinct_holders', all_holders, 'promoter_rows', promoters);