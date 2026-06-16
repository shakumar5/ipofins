/**
 * Finverse — Neon Database Client
 * 
 * Used at build time by Astro pages and by data scripts.
 * Uses @neondatabase/serverless for HTTP-based queries (no persistent connection needed).
 * 
 * Usage in Astro pages:
 *   import { sql } from '../lib/db';
 *   const funds = await sql`SELECT * FROM funds WHERE category = ${category}`;
 * 
 * Usage in scripts:
 *   import { sql } from '../src/lib/db.ts';  // or use scripts/lib/db.mjs
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Add it to .env file or environment variables.\n' +
    'Get it from: https://console.neon.tech → Your Project → Connection Details'
  );
}

/**
 * Tagged template literal for SQL queries.
 * Automatically parameterizes values to prevent SQL injection.
 * 
 * @example
 * const funds = await sql`SELECT * FROM funds WHERE category = ${category}`;
 * const ipo = await sql`SELECT * FROM ipos WHERE slug = ${slug}`;
 */
export const sql = neon(DATABASE_URL);

/**
 * Helper: Execute a query and return typed results.
 * Useful when you want explicit typing in TypeScript.
 */
export async function query<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return sql(strings, ...values) as Promise<T[]>;
}
