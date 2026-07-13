/**
 * Fix Mahindra Manulife funds wrongly attached to ICICI Prudential AMC
 * (legacy fuzzy matcher corruption).
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dbUrl = readFileSync(join(ROOT, '.env'), 'utf8').match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const [mahindra] = await sql`SELECT id, name FROM amcs WHERE slug = 'mahindra-manulife' LIMIT 1`;
if (!mahindra) throw new Error('Mahindra Manulife AMC not found');

const before = await sql`
  SELECT COUNT(*)::int AS n
  FROM funds
  WHERE slug ILIKE 'mahindra-manulife%'
    AND amc_id <> ${mahindra.id}
`;
console.log(`Wrong-AMC Mahindra funds: ${before[0].n} (target amc_id=${mahindra.id})`);

const updated = await sql`
  UPDATE funds
  SET amc_id = ${mahindra.id}
  WHERE slug ILIKE 'mahindra-manulife%'
    AND amc_id <> ${mahindra.id}
  RETURNING slug, amc_id
`;
console.log(`Updated ${updated.length} funds to ${mahindra.name}`);
for (const r of updated.slice(0, 20)) console.log(`  ✓ ${r.slug}`);
if (updated.length > 20) console.log(`  … +${updated.length - 20} more`);
