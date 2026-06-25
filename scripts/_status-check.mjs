import { sql } from './lib/db.mjs';

const q = '2026-01-01';
const [u] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM stocks WHERE NULLIF(TRIM(nse_symbol),'') IS NOT NULL) AS nse_universe,
    (SELECT COUNT(*)::int FROM stocks WHERE NULLIF(TRIM(bse_code),'') IS NOT NULL AND NULLIF(TRIM(nse_symbol),'') IS NULL) AS bse_only_universe,
    (SELECT COUNT(DISTINCT s.id)::int FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id WHERE sph.quarter=${q}::date AND NULLIF(TRIM(s.nse_symbol),'') IS NOT NULL) AS nse_with_sph,
    (SELECT COUNT(DISTINCT s.id)::int FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id WHERE sph.quarter=${q}::date AND NULLIF(TRIM(s.bse_code),'') IS NOT NULL AND NULLIF(TRIM(s.nse_symbol),'') IS NULL) AS bse_with_sph,
    (SELECT COUNT(*)::int FROM shareholding_pattern_holders WHERE quarter=${q}::date) AS total_sph,
    (SELECT COUNT(*)::int FROM shareholding_pattern_holders WHERE quarter=${q}::date AND pct_of_company>=1 AND is_promoter=false) AS gte1_club,
    (SELECT COUNT(*)::int FROM entity_holdings WHERE quarter=${q}::date) AS entity_holdings,
    (SELECT COUNT(*)::int FROM entity_stock_signals WHERE quarter=${q}::date) AS signals,
    (SELECT COUNT(*)::int FROM entity_quarterly_stats WHERE quarter=${q}::date) AS eqs
`;
console.log(JSON.stringify(u, null, 2));
