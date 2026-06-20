/**
 * Post-build: clone portfolio overlap hub HTML with unique SSR meta per fund pair.
 * Runs after `astro build` — avoids 120k+ Astro page compilations.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_HUB = join(ROOT, 'dist', 'mutual-funds', 'portfolio-overlap-checker', 'index.html');
const DATA_PATH = join(ROOT, 'public', 'data', 'portfolio-overlap.json');
const BRAND_URL = 'https://ipofins.com';
const HUB_PATH = '/mutual-funds/portfolio-overlap-checker';

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPageMeta(slugs, nameBySlug, month) {
  const names = slugs.map((slug) => nameBySlug.get(slug)).filter(Boolean);
  if (names.length < 2) {
    return {
      title: 'Portfolio Overlap Checker — Compare Mutual Fund Holdings | IPOFins',
      description:
        'Compare portfolio overlap across 2 to 4 mutual funds. See overlap percentage and shared stock holdings from latest AMC disclosures.',
      path: HUB_PATH,
      subtitle: 'See how much your mutual funds overlap before you unknowingly double up on the same stocks.',
    };
  }
  const label = names.join(' vs ');
  const path = `${HUB_PATH}/${slugs.join('-vs-')}`;
  const monthNote = month ? ` (${month} holdings)` : '';
  return {
    title: `${label} — Portfolio Overlap Comparison | IPOFins`,
    description: `Compare portfolio overlap between ${names.join(', ')}. See overlap percentage and shared stock holdings${monthNote}.`,
    path,
    subtitle: `Comparing ${label}`,
  };
}

function patchHtml(template, meta, initialSlugs) {
  let html = template;

  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = `${BRAND_URL}${meta.path}`;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${description}">`,
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${canonical}">`,
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${title}">`,
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${description}">`,
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${canonical}">`,
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${title}">`,
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${description}">`,
  );

  const slugsJson = JSON.stringify(initialSlugs);
  if (html.includes('"initialSlugs":[]')) {
    html = html.replace('"initialSlugs":[]', `"initialSlugs":${slugsJson}`);
  } else if (html.includes('\\"initialSlugs\\":[]')) {
    html = html.replace('\\"initialSlugs\\":[]', `\\"initialSlugs\\":${slugsJson.replace(/"/g, '\\"')}`);
  }

  if (meta.subtitle && html.includes('data-page-subtitle')) {
    html = html.replace(
      /(<[^>]*data-page-subtitle[^>]*>)[^<]*(<\/)/,
      `$1${escapeHtml(meta.subtitle)}$2`,
    );
  }

  return html;
}

function main() {
  if (!existsSync(DIST_HUB)) {
    console.warn('  ⚠ generate-overlap-static-pages: hub index.html missing — skip');
    return;
  }
  if (!existsSync(DATA_PATH)) {
    console.warn('  ⚠ generate-overlap-static-pages: portfolio-overlap.json missing — skip');
    return;
  }

  const template = readFileSync(DIST_HUB, 'utf8');
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const funds = [...data.funds].sort((a, b) => a.slug.localeCompare(b.slug));
  const nameBySlug = new Map(funds.map((f) => [f.slug, f.name]));
  const month = data.month;

  let written = 0;
  for (let i = 0; i < funds.length; i += 1) {
    for (let j = i + 1; j < funds.length; j += 1) {
      const slugs = [funds[i].slug, funds[j].slug];
      const comparison = `${slugs[0]}-vs-${slugs[1]}`;
      const meta = buildPageMeta(slugs, nameBySlug, month);
      const html = patchHtml(template, meta, slugs);
      const outDir = join(ROOT, 'dist', 'mutual-funds', 'portfolio-overlap-checker', comparison);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'index.html'), html);
      written += 1;
    }
  }

  console.log(`  ✓ generate-overlap-static-pages.mjs (${written} comparison pages with unique SSR meta)`);
}

main();
