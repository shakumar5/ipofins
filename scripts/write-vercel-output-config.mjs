#!/usr/bin/env node
/**
 * Write .vercel/output/config.json for prebuilt (Build Output API v3) deploys.
 *
 * CRITICAL: `vercel deploy --prebuilt` uses THIS file and ignores the root
 * vercel.json. Any redirects / headers / rewrites defined only in vercel.json are
 * NOT applied in production. This script is the single source of truth for the
 * production edge config, so keep it in sync with vercel.json.
 *
 * Usage:
 *   node scripts/write-vercel-output-config.mjs          # full static-only config
 *   node scripts/write-vercel-output-config.mjs --merge  # prepend edge rules to @astrojs/vercel output
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, '.vercel', 'output');
const OUT_FILE = join(OUT_DIR, 'config.json');
const mergeMode = process.argv.includes('--merge');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function edgeRoutes() {
  return [
    { src: '/(.*)', headers: SECURITY_HEADERS, continue: true },
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
    {
      src: '/mutual-funds/portfolio-overlap-checker/([^/]+-vs-[^/]+)/?',
      dest: '/mutual-funds/portfolio-overlap-checker/index.html',
    },
  ];
}

function postFilesystemRoutes() {
  return [
    { src: '/mutual-funds/fund/(.+)-holdings/?$', dest: '/404.html', status: 404 },
    {
      src: '/mutual-funds/fund/([^/]+)/?$',
      status: 308,
      headers: { Location: '/mutual-funds/fund/$1-holdings' },
    },
  ];
}

function isDuplicateEdgeRoute(route) {
  return route.src === '/(.*)' && route.headers?.['X-Content-Type-Options'];
}

let config;

if (mergeMode && existsSync(OUT_FILE)) {
  const existing = JSON.parse(readFileSync(OUT_FILE, 'utf-8'));
  const kept = (existing.routes ?? []).filter((r) => !isDuplicateEdgeRoute(r));
  config = { ...existing, version: 3, routes: [...edgeRoutes(), ...kept] };
} else {
  config = {
    version: 3,
    routes: [
      ...edgeRoutes(),
      { handle: 'filesystem' },
      ...postFilesystemRoutes(),
    ],
  };
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(config, null, 2)}\n`);
console.log(`  Wrote ${OUT_FILE} (${config.routes.length} routes${mergeMode ? ', merged' : ''})`);
