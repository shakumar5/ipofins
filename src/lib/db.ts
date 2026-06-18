/**
 * Finverse — Neon Database Client
 *
 * Used at build time by Astro pages. Requires DATABASE_URL in .env or Vercel env.
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;

export function isDbConfigured(): boolean {
  return !!DATABASE_URL;
}

export const sql: ReturnType<typeof neon> | null = DATABASE_URL ? neon(DATABASE_URL) : null;

export function requireDb() {
  if (!sql) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env (local) or Vercel environment variables.\n' +
        'Run data pipelines first: npm run pipeline:daily'
    );
  }
  return sql;
}
