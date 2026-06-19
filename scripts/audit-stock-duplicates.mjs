/**
 * Audit duplicate stocks and bad sector data.
 */
import { sql, isDbConfigured } from './lib/db.mjs';

if (!isDbConfigured()) process.exit(1);

function normName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\bltd\.?\b/g, 'ltd')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bltd\s*$/g, '')
    .trim();
}

// Duplicate ISINs
const dupIsin = await sql`
  SELECT isin, COUNT(*)::int AS c, array_agg(id ORDER BY id) AS ids,
         array_agg(name ORDER BY id) AS names
  FROM stocks
  WHERE isin IS NOT NULL AND TRIM(isin) <> ''
  GROUP BY isin HAVING COUNT(*) > 1
  ORDER BY c DESC LIMIT 20
`;
console.log('Duplicate ISIN groups:', dupIsin.length);
for (const r of dupIsin.slice(0, 8)) {
  console.log(`  ${r.isin} (${r.c}):`, r.names.join(' | '));
}

// Same normalized name, different ids (no ISIN or different ISIN)
const allStocks = await sql`SELECT id, name, isin, slug, sector_id FROM stocks ORDER BY id`;
const byNorm = new Map();
for (const s of allStocks) {
  const k = normName(s.name);
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(s);
}
const normDups = [...byNorm.entries()].filter(([, arr]) => arr.length > 1);
console.log('\nNormalized name duplicates:', normDups.length);
for (const [k, arr] of normDups.slice(0, 10)) {
  console.log(`  ${k}:`, arr.map((s) => `#${s.id} ${s.name} isin=${s.isin || 'null'}`).join(' | '));
}

// Bad sectors in holdings_changes (May 2026 increased)
const badSector = await sql`
  SELECT s.name, COALESCE(sec.name, '') AS sector, COUNT(*)::int AS c
  FROM holdings_changes hc
  JOIN stocks s ON s.id = hc.stock_id
  LEFT JOIN sectors sec ON sec.id = s.sector_id
  WHERE hc.month = (SELECT MAX(month) FROM holdings_changes)
    AND hc.change_type = 'increased'
  GROUP BY s.name, sec.name
  HAVING COALESCE(sec.name, '') ~ '^[0-9]+$'
     OR COALESCE(sec.name, '') ~ '^(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork|\\[ICRA\\])'
  ORDER BY c DESC LIMIT 15
`;
console.log('\nBad sector in increased changes:', badSector.length);
for (const r of badSector) console.log(`  ${r.name} | sector="${r.sector}"`);

// ICICI/HDFC bank dup check in smart money aggregation
const bankDups = await sql`
  SELECT s.id, s.name, s.isin, s.slug, COALESCE(sec.name,'') AS sector
  FROM stocks s
  LEFT JOIN sectors sec ON sec.id = s.sector_id
  WHERE s.name ILIKE '%icici bank%' OR s.name ILIKE '%hdfc bank%'
  ORDER BY s.name
`;
console.log('\nBank stock rows:');
for (const r of bankDups) console.log(`  #${r.id} ${r.name} | ${r.isin} | ${r.sector}`);

// Holdings on duplicate ICICI
const iciciIds = bankDups.filter((r) => r.name.toLowerCase().includes('icici')).map((r) => r.id);
if (iciciIds.length) {
  const hc = await sql`
    SELECT s.name, hc.change_type, COUNT(DISTINCT hc.fund_id)::int AS funds
    FROM holdings_changes hc
    JOIN stocks s ON s.id = hc.stock_id
    WHERE hc.stock_id = ANY(${iciciIds})
      AND hc.month = (SELECT MAX(month) FROM holdings_changes)
      AND hc.change_type = 'increased'
    GROUP BY s.name, hc.change_type
  `;
  console.log('\nICICI increased by stock row:');
  for (const r of hc) console.log(`  ${r.name}: ${r.funds} funds`);
}
