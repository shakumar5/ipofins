/**
 * Rasterize public/og-*.svg → og-*.png + og-*.webp (1200×630) for social meta tags.
 * Skips regeneration when SVG content hash matches .og-hash sidecar.
 * Run: node scripts/generate-og-images.mjs
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const WIDTH = 1200;
const HEIGHT = 630;
const MIN_PNG_BYTES = 10_000;
const MIN_WEBP_BYTES = 5_000;

const { default: sharp } = await import('sharp');

const files = ['og-default', 'og-ipo', 'og-fund'];

function svgHash(svgPath) {
  return createHash('sha256').update(readFileSync(svgPath)).digest('hex').slice(0, 16);
}

function isUpToDate(name, hash) {
  const hashPath = join(PUBLIC, `${name}.og-hash`);
  const pngPath = join(PUBLIC, `${name}.png`);
  const webpPath = join(PUBLIC, `${name}.webp`);
  if (!existsSync(hashPath) || !existsSync(pngPath) || !existsSync(webpPath)) return false;
  const stored = readFileSync(hashPath, 'utf8').trim();
  if (stored !== hash) return false;
  const svgMtime = statSync(join(PUBLIC, `${name}.svg`)).mtimeMs;
  return statSync(pngPath).mtimeMs >= svgMtime && statSync(webpPath).mtimeMs >= svgMtime;
}

for (const name of files) {
  const svgPath = join(PUBLIC, `${name}.svg`);
  const pngPath = join(PUBLIC, `${name}.png`);
  const webpPath = join(PUBLIC, `${name}.webp`);
  const hashPath = join(PUBLIC, `${name}.og-hash`);

  if (!existsSync(svgPath)) {
    console.error(`  ✗ Missing ${name}.svg`);
    process.exit(1);
  }

  const hash = svgHash(svgPath);
  if (isUpToDate(name, hash)) {
    console.log(`  ⏭ ${name} up to date (hash ${hash})`);
    continue;
  }

  const pipeline = sharp(svgPath).resize(WIDTH, HEIGHT);
  await pipeline.clone().png().toFile(pngPath);
  await pipeline.clone().webp({ quality: 85 }).toFile(webpPath);

  const pngBytes = statSync(pngPath).size;
  const webpBytes = statSync(webpPath).size;
  if (pngBytes < MIN_PNG_BYTES) {
    console.error(`  ✗ ${name}.png too small (${pngBytes} bytes)`);
    process.exit(1);
  }
  if (webpBytes < MIN_WEBP_BYTES) {
    console.error(`  ✗ ${name}.webp too small (${webpBytes} bytes)`);
    process.exit(1);
  }

  writeFileSync(hashPath, `${hash}\n`, 'utf8');
  console.log(
    `  ✅ ${name}.png (${(pngBytes / 1024).toFixed(0)} KB) + .webp (${(webpBytes / 1024).toFixed(0)} KB)`,
  );
}

console.log('\nDone — OG PNG + WebP ready in public/');
