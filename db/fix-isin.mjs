import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

// Remove UNIQUE constraint on ISIN — multiple stocks can share ISIN (different name variants)
await sql`ALTER TABLE stocks DROP CONSTRAINT IF EXISTS stocks_isin_key`;
await sql`DROP INDEX IF EXISTS idx_stocks_isin`;
await sql`CREATE INDEX IF NOT EXISTS idx_stocks_isin_nonunique ON stocks(isin)`;
console.log('✅ ISIN constraint removed, non-unique index added');
