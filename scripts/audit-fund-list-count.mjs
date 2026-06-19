import { sql, isDbConfigured } from './lib/db.mjs';

if (!isDbConfigured()) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const total = await sql`SELECT COUNT(*)::int AS c FROM funds WHERE is_active = true`;
const directScheme = await sql`
  SELECT COUNT(*)::int AS c FROM funds
  WHERE is_active = true AND slug LIKE '%-direct-plan' AND scheme_code IS NOT NULL AND TRIM(scheme_code) <> ''
`;
const dedupCurrent = await sql`
  SELECT COUNT(*)::int AS c FROM (
    SELECT DISTINCT ON (
      f.amc_id,
      regexp_replace(regexp_replace(LOWER(f.slug), '-direct-plan$', ''), '-regular-plan$', '')
    ) f.id
    FROM funds f
    WHERE f.is_active = true
      AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
    ORDER BY
      f.amc_id,
      regexp_replace(regexp_replace(LOWER(f.slug), '-direct-plan$', ''), '-regular-plan$', ''),
      (CASE WHEN f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> '' THEN 0 ELSE 1 END),
      (CASE WHEN f.slug LIKE '%-direct-plan' THEN 0 WHEN f.slug LIKE '%-regular-plan' THEN 1 ELSE 2 END),
      f.id
  ) x
`;

const strictDirect = await sql`
  SELECT COUNT(*)::int AS c FROM funds f
  WHERE f.is_active = true
    AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
    AND f.slug LIKE '%-direct-plan'
    AND f.name NOT ILIKE '%IDCW%'
    AND f.name NOT ILIKE '%dividend%'
    AND f.category NOT ILIKE '%debt%'
    AND f.category NOT ILIKE '%liquid%'
    AND f.category NOT ILIKE '%overnight%'
    AND f.category NOT ILIKE '%money market%'
    AND f.category NOT ILIKE '%gilt%'
    AND f.category NOT ILIKE '%bond%'
    AND f.category NOT ILIKE '%hybrid%'
    AND f.category NOT ILIKE '%balanced%'
    AND f.category NOT ILIKE '%arbitrage%'
    AND f.category NOT ILIKE '%gold%'
    AND f.category NOT ILIKE '%silver%'
    AND f.category NOT IN ('Index', 'FoF', 'Fund of Funds', 'Other')
`;

const equityDirect = await sql`
  SELECT COUNT(*)::int AS c FROM funds f
  WHERE f.is_active = true
    AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
    AND f.slug LIKE '%-direct-plan'
    AND f.category IN (
      'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
      'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield'
    )
`;

const cats = await sql`
  SELECT category, COUNT(*)::int AS c FROM funds
  WHERE is_active = true AND slug LIKE '%-direct-plan' AND scheme_code IS NOT NULL
  GROUP BY category ORDER BY c DESC
`;

console.log('Counts:', {
  totalActive: total[0].c,
  directWithScheme: directScheme[0].c,
  dedupCurrentQuery: dedupCurrent[0].c,
  strictDirectNonDebt: strictDirect[0].c,
  equityDirectOnly: equityDirect[0].c,
});
const withIndex = await sql`
  SELECT COUNT(*)::int AS c FROM funds f
  WHERE f.is_active = true
    AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
    AND f.slug LIKE '%-direct-plan'
    AND (
      f.category IN (
        'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
        'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield', 'Index'
      )
      OR (f.category ILIKE '%index%' AND f.category NOT ILIKE '%debt%')
    )
    AND f.name NOT ILIKE '%IDCW%'
    AND f.name NOT ILIKE '%dividend payout%'
    AND f.name NOT ILIKE '%dividend plan%'
`;

const LISTABLE = [
  'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
  'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield', 'Index',
];
const newList = await sql`
  SELECT COUNT(*)::int AS c FROM funds f
  WHERE f.is_active = true
    AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
    AND f.slug LIKE '%-direct-plan'
    AND f.category = ANY(${LISTABLE})
    AND f.name NOT ILIKE '%IDCW%'
    AND f.name NOT ILIKE '%dividend payout%'
    AND f.name NOT ILIKE '%dividend plan%'
    AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
`;
console.log('New getAllFunds count:', newList[0].c);

console.log('\nDirect+scheme by category:');
for (const r of cats) console.log(`  ${r.category}: ${r.c}`);
