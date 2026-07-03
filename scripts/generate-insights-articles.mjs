#!/usr/bin/env node
/**
 * Generate data-driven Learn / insights articles from public/data exports.
 * Output: src/data/insights-articles.generated.json
 *         public/data/insights-social-posts.json (copy-paste for social)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadInsightsData } from './lib/insights-articles/load-data.mjs';
import { generateAllInsightsArticles } from './lib/insights-articles/generate-all.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ARTICLES = join(ROOT, 'src', 'data', 'insights-articles.generated.json');
const OUT_SOCIAL = join(ROOT, 'public', 'data', 'insights-social-posts.json');
const OUT_MANIFEST = join(ROOT, 'public', 'data', 'insights-manifest.json');

function main() {
  const data = loadInsightsData(ROOT);
  const articles = generateAllInsightsArticles(data);

  const payload = {
    generatedAt: data.generatedAt,
    sourceMonth: data.latestMonth,
    articleCount: articles.length,
    articles,
  };

  mkdirSync(dirname(OUT_ARTICLES), { recursive: true });
  writeFileSync(OUT_ARTICLES, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');

  const socialPosts = articles.map((a) => ({
    title: a.title,
    slug: a.slug,
    tier: a.tier,
    url: a.url,
    socialPost: a.socialPost,
    category: a.category,
    month: a.month,
  }));

  writeFileSync(OUT_SOCIAL, `${JSON.stringify(socialPosts, null, 2)}\n`, 'utf8');

  const manifest = {
    generatedAt: data.generatedAt,
    sourceMonth: data.latestMonth,
    articleCount: articles.length,
    tiers: {
      1: articles.filter((a) => a.tier === 1).length,
      2: articles.filter((a) => a.tier === 2).length,
      3: articles.filter((a) => a.tier === 3).length,
    },
    urls: articles.map((a) => ({ title: a.title, url: a.url, tier: a.tier })),
  };
  writeFileSync(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`✓ Generated ${articles.length} insights articles (${data.latestMonth || 'no month'})`);
  console.log(`  → ${OUT_ARTICLES}`);
  console.log(`  → ${OUT_SOCIAL}`);
  console.log(`  Tier 1: ${manifest.tiers[1]} | Tier 2: ${manifest.tiers[2]} | Tier 3: ${manifest.tiers[3]}`);
}

main();
