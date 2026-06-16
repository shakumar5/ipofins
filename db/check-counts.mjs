import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const r = await sql`
  SELECT 
    (SELECT COUNT(*) FROM amcs) as amcs,
    (SELECT COUNT(*) FROM funds) as funds,
    (SELECT COUNT(*) FROM fund_returns) as returns,
    (SELECT COUNT(*) FROM ipos) as ipos,
    (SELECT COUNT(*) FROM stocks) as stocks,
    (SELECT COUNT(*) FROM fund_holdings) as holdings
`;
console.log('Database row counts:');
console.log(r[0]);
