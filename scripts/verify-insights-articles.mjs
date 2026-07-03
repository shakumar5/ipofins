#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES = join(ROOT, 'src', 'data', 'insights-articles.generated.json');
const SOCIAL = join(ROOT, 'public', 'data', 'insights-social-posts.json');
const MIN_ARTICLES = Number(process.env.INSIGHTS_MIN_ARTICLES || 10);

function fail(msg) {
  console.error(`✗ insights-articles: ${msg}`);
  process.exit(1);
}

if (!existsSync(ARTICLES)) {
  fail(`missing ${ARTICLES} — run: npm run generate:insights`);
}

let articles;
try {
  articles = JSON.parse(readFileSync(ARTICLES, 'utf8'));
} catch (e) {
  fail(`invalid JSON: ${e.message}`);
}

if (!Array.isArray(articles) || articles.length < MIN_ARTICLES) {
  fail(`expected >= ${MIN_ARTICLES} articles, got ${Array.isArray(articles) ? articles.length : 0}`);
}

const bad = articles.find((a) => !a.slug || !a.title || !a.content?.trim());
if (bad) fail(`article missing slug/title/content: ${JSON.stringify(bad?.slug)}`);

if (!existsSync(SOCIAL)) {
  fail(`missing ${SOCIAL}`);
}

console.log(`✓ insights-articles OK (${articles.length} articles)`);
