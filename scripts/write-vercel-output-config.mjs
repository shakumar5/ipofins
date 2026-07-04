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
    // -- Security headers (all responses) --
    { src: '/(.*)', headers: SECURITY_HEADERS, continue: true },

    // -- Cache-Control --
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

    // -- Canonical host redirects: force the single apex host (ipofins.com). --
    // www and the Vercel preview host both serve the whole site (HTTP 200), which
    // makes Google treat them as a duplicate site. Redirect them to the apex so
    // there is exactly one indexable host.
    {
      src: '/(.*)',
      has: [{ type: 'host', value: 'www.ipofins.com' }],
      status: 308,
      headers: { Location: 'https://ipofins.com/$1' },
    },
    {
      src: '/(.*)',
      has: [{ type: 'host', value: 'ipofins.vercel.app' }],
      status: 308,
      headers: { Location: 'https://ipofins.com/$1' },
    },

    // -- Redirects for renamed / removed routes (keep in sync with vercel.json) --
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

    // -- Portfolio overlap comparison deep links -> hub HTML --
    {
      src: '/mutual-funds/portfolio-overlap-checker/([^/]+-vs-[^/]+)/?',
      dest: '/mutual-funds/portfolio-overlap-checker/index.html',
    },

    // -- Serve static files from the build output --
    { handle: 'filesystem' },

    // -- Post-filesystem fallbacks (only run when no static file matched) --
    // Fund detail pages live at /mutual-funds/fund/<slug>-holdings. Bare <slug>
    // URLs (the old format Google still has indexed) 404 today; redirect them to
    // the -holdings page. Placed after `filesystem` so real -holdings pages win.
    //
    // A <slug>-holdings URL that still misses here is a delisted fund: serve a
    // real 404. This route MUST come first so the bare-slug redirect below never
    // re-appends -holdings to it (which would cause an infinite redirect loop).
    { src: '/mutual-funds/fund/(.+)-holdings/?$', dest: '/404.html', status: 404 },
    {
      src: '/mutual-funds/fund/([^/]+)/?$',
      status: 308,
      headers: { Location: '/mutual-funds/fund/$1-holdings' },
    },
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(config, null, 2)}\n`);
console.log(`  Wrote ${OUT_FILE} (${config.routes.length} routes)`);
