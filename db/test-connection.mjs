import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf-8');
let dbUrl = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.slice('DATABASE_URL='.length).trim();
  }
}

console.log('Testing connection to Neon...');
console.log('Endpoint:', dbUrl.replace(/:[^:@]+@/, ':***@'));

try {
  const sql = neon(dbUrl);
  const result = await sql`SELECT NOW() as time, current_database() as db`;
  console.log('✅ Connected!');
  console.log('   Database:', result[0].db);
  console.log('   Server time:', result[0].time);
} catch (err) {
  console.error('❌ Connection failed:', err.message);
  if (err.cause) console.error('   Cause:', err.cause.message || err.cause);
  if (process.platform === 'win32' && !process.execArgv.includes('--use-system-ca')) {
    console.error('   Tip: run with --use-system-ca or: npm run export:client-data');
  }
  process.exit(1);
}
