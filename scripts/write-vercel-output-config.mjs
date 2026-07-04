#!/usr/bin/env node
/**
 * Write .vercel/output/config.json for prebuilt (Build Output API v3) deploys.
 *
 * CRITICAL: `vercel deploy --prebuilt` uses THIS file and ignores the root
 * vercel.json. Any redirects / headers / rewrites defined only in vercel.json are
 * NOT applied in production. This script is the single source of truth for the
 * production edge config, so keep it in sync with vercel.json.
 *
 * Replaces the inline `cat > .vercel/output/config.json` heredoc that was
 * duplicated across every deploy workflow.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, '.vercel', 'output');
const OUT_FILE = join(OUT_DIR, 'config.json');

// Low-risk security headers. Applied to every response.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Content-Security-Policy is intentionally NOT emitted yet. It has never actually
// been active in production (vercel.json was ignored by prebuilt deploys), so
// enabling it blind risks blocking GA / AdSense / hydration. Validate on a preview
// deploy first, then move the policy from vercel.json into SECURITY_HEADERS.

const config = {
  version: 3,
  routes: [
    // ── Security headers (all responses) ──
    { src: '/(.*)', headers: SECURITY_HEADERS, continue: true },

    // ── Cache-Control ──
    {
      src: '/_astro/(.*)',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    {
      src: '/fonts/(.*)',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    {
      src: '/data/holdings-compare/(.*)',
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
      continue: true,
    },
    {
      src: '/data/(.*)',
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
      continue: true,
    },

    // ── Canonical host redirect (vercel.app → ipofins.com) ──
    {
      src: '/(.*)',
      has: [{ type: 'host', value: 'ipofins.vercel.app' }],
      status: 308,
      headers: { Location: 'https://ipofins.com/$1' },
    },

    // ── Redirects for renamed / removed routes (keep in sync with vercel.json) ──
    { src: '/ipo/gmp-today/?', status: 308, headers: { Location: '/ipo/subscription-status' } },
    {
      src: '/mutual-funds/holdings-changes/(.+)',
      status: 308,
      headers: { Location: '/mutual-funds/mutual-fund-holdings-changes/$1' },
    },
    {
      src: '/mutual-funds/holdings-changes/?',
      status: 308,
      headers: { Location: '/mutual-funds/mutual-fund-holdings-changes' },
    },

    // ── Portfolio overlap comparison deep links → hub HTML ──
    {
      src: '/mutual-funds/portfolio-overlap-checker/([^/]+-vs-[^/]+)/?',
      dest: '/mutual-funds/portfolio-overlap-checker/index.html',
    },

    // ── Serve static files from the build output ──
    { handle: 'filesystem' },
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(config, null, 2)}\n`);
console.log(`  ✓ Wrote ${OUT_FILE} (${config.routes.length} routes)`);
