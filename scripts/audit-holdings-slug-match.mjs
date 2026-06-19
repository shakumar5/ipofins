/**
 * Audit holdings slug coverage for listable Direct Plan funds.
 */
import { sql, isDbConfigured } from './lib/db.mjs';
import { normalizeFundName } from './lib/fund-match.mjs';

if (!isDbConfigured()) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const LISTABLE = [
  'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
  'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield', 'Index',
];

const amcRows = await sql`SELECT id, name FROM amcs`;
const amcNameById = Object.fromEntries(amcRows.map((a) => [a.id, a.name]));

const listable = await sql`
  SELECT f.id, f.slug, f.name, f.scheme_code, f.amc_id
  FROM funds f
  WHERE f.is_active = true
    AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
    AND f.slug LIKE '%-direct-plan'
    AND f.category = ANY(${LISTABLE})
    AND f.name NOT ILIKE '%IDCW%'
    AND f.name NOT ILIKE '%dividend payout%'
    AND f.name NOT ILIKE '%dividend plan%'
    AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
`;

const holders = await sql`
  SELECT DISTINCT fh.fund_id, hf.slug AS holder_slug, hf.name AS holder_name, hf.amc_id, hf.scheme_code
  FROM fund_holdings fh
  JOIN funds hf ON hf.id = fh.fund_id
  WHERE fh.month = (SELECT MAX(month) FROM fund_holdings)
`;

// Build lookup: amc_id|normalizedName -> has holdings
const holderByNorm = new Set();
const holderByScheme = new Set();
for (const h of holders) {
  const norm = normalizeFundName(h.holder_name, amcNameById[h.amc_id] || '');
  holderByNorm.add(`${h.amc_id}|${norm}`);
  if (h.scheme_code) holderByScheme.add(`${h.amc_id}|${h.scheme_code}`);
}

// Current logic
const directRows = await sql`
  SELECT DISTINCT d.slug
  FROM fund_holdings fh
  JOIN funds h ON h.id = fh.fund_id
  JOIN funds d ON d.amc_id = h.amc_id AND d.is_active = true
  WHERE fh.month = (SELECT MAX(month) FROM fund_holdings)
    AND d.slug LIKE '%-direct-plan'
    AND d.scheme_code IS NOT NULL
    AND h.id != d.id
    AND LOWER(SPLIT_PART(d.name, ' - Direct', 1)) = LOWER(SPLIT_PART(h.name, ' (', 1))
`;
const holderSlugs = await sql`
  SELECT DISTINCT f.slug FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  WHERE f.is_active = true
    AND fh.month = (SELECT MAX(month) FROM fund_holdings)
`;
const currentSet = new Set([
  ...holderSlugs.map((r) => r.slug),
  ...directRows.map((r) => r.slug),
]);

let currentMatched = 0;
let normMatched = 0;
let schemeMatched = 0;
let eitherMatched = 0;
const stillMissing = [];

for (const f of listable) {
  const norm = normalizeFundName(f.name, amcNameById[f.amc_id] || '');
  const normKey = `${f.amc_id}|${norm}`;
  const schemeKey = `${f.amc_id}|${f.scheme_code}`;
  const viaCurrent = currentSet.has(f.slug);
  const viaNorm = holderByNorm.has(normKey);
  const viaScheme = holderByScheme.has(schemeKey);
  if (viaCurrent) currentMatched++;
  if (viaNorm) normMatched++;
  if (viaScheme) schemeMatched++;
  if (viaCurrent || viaNorm || viaScheme) eitherMatched++;
  else stillMissing.push(f.slug);
}

// New getFundSlugsWithHoldings SQL
const newRows = await sql`
  WITH latest AS (SELECT MAX(month) AS m FROM fund_holdings),
  holders AS (
    SELECT DISTINCT f.id AS holder_id, f.amc_id, f.scheme_code AS holder_scheme,
      regexp_replace(regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''), '-growth-option$', '') AS holder_base
    FROM fund_holdings fh JOIN funds f ON f.id = fh.fund_id
    WHERE fh.month = (SELECT m FROM latest)
  ),
  listable AS (
    SELECT f.id, f.slug, f.amc_id, f.scheme_code,
      regexp_replace(regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''), '-growth-option$', '') AS base_slug
    FROM funds f
    WHERE f.is_active AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
      AND f.slug LIKE '%-direct-plan' AND f.category = ANY(${LISTABLE})
      AND f.name NOT ILIKE '%IDCW%' AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
  )
  SELECT DISTINCT l.slug FROM listable l
  WHERE EXISTS (
    SELECT 1 FROM holders h WHERE h.holder_id = l.id
      OR (
        l.amc_id IS NOT NULL
        AND h.amc_id = l.amc_id
        AND h.holder_scheme IS NOT NULL
        AND TRIM(h.holder_scheme) <> ''
        AND h.holder_scheme = l.scheme_code
      )
      OR (
        l.amc_id IS NOT NULL
        AND h.amc_id = l.amc_id
        AND h.holder_base = l.base_slug
      )
      OR h.holder_base = l.base_slug
  )
`;
console.log('New SQL match count:', newRows.length);

console.log('Distinct funds with holdings rows:', holders.length);
console.log('Current getFundSlugsWithHoldings match:', currentMatched);
console.log('Proposed norm match:', normMatched);
console.log('Proposed scheme match:', schemeMatched);
console.log('Proposed combined match:', eitherMatched);
console.log('Still no holdings in DB:', stillMissing.length);
function baseSlug(slug) {
  return slug
    .toLowerCase()
    .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option|-income-distribution.*)?$/i, '')
    .replace(/-growth-option$/, '')
    .replace(/-growth$/, '');
}

const holderByBase = new Set();
for (const h of holders) {
  holderByBase.add(`${h.amc_id}|${baseSlug(h.holder_slug)}`);
}

let baseMatched = 0;
for (const f of listable) {
  if (holderByBase.has(`${f.amc_id}|${baseSlug(f.slug)}`)) baseMatched++;
}
console.log('Proposed base-slug match:', baseMatched);

// Compare listable slugs in currentSet vs not
const inSet = listable.filter((f) => currentSet.has(f.slug));
const notInSet = listable.filter((f) => !currentSet.has(f.slug));
console.log('In currentSet:', inSet.length, 'Not in currentSet:', notInSet.length);

// holders that are direct plan but slug not in listable slugs
const listableSlugs = new Set(listable.map((f) => f.slug));
const directHoldersNotInList = holders.filter(
  (h) => h.holder_slug.includes('direct-plan') && !listableSlugs.has(h.holder_slug)
);
console.log('Direct-plan holders not in listable set:', directHoldersNotInList.length);
for (const h of directHoldersNotInList.slice(0, 8)) {
  console.log(' ', h.holder_slug);
}

let amcHasOther = 0;
for (const slug of stillMissing.slice(0, 30)) {
  const f = listable.find((x) => x.slug === slug);
  if (!f) continue;
  const others = await sql`
    SELECT DISTINCT hf.slug, hf.name, hf.scheme_code
    FROM fund_holdings fh
    JOIN funds hf ON hf.id = fh.fund_id
    WHERE hf.amc_id = ${f.amc_id}
      AND fh.month = (SELECT MAX(month) FROM fund_holdings)
    LIMIT 5
  `;
  if (others.length) {
    amcHasOther++;
    console.log(`\n${slug} — AMC has holdings on:`);
    for (const o of others) console.log(`  ${o.slug} | ${o.name} | scheme=${o.scheme_code}`);
  }
}
console.log(`\nMissing funds whose AMC has other holdings (sample 30): ${amcHasOther}`);
