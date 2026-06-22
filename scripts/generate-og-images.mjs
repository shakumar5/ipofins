/**
 * Rasterize public/og-*.svg → og-*.png (1200×630) for social meta tags.
 * Run: node scripts/generate-og-images.mjs
 */
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const WIDTH = 1200;
const HEIGHT = 630;
const MIN_PNG_BYTES = 10_000;

const { default: sharp } = await import('sharp');

const files = ['og-default', 'og-ipo', 'og-fund'];

for (const name of files) {
  const svgPath = join(PUBLIC, `${name}.svg`);
  const pngPath = join(PUBLIC, `${name}.png`);

  if (!existsSync(svgPath)) {
    console.error(`  ✗ Missing ${name}.svg`);
    process.exit(1);
  }

  if (existsSync(pngPath) && statSync(pngPath).mtimeMs >= statSync(svgPath).mtimeMs) {
    console.log(`  ⏭ ${name}.png up to date`);
    continue;
  }

  await sharp(svgPath).resize(WIDTH, HEIGHT).png().toFile(pngPath);

  const bytes = statSync(pngPath).size;
  if (bytes < MIN_PNG_BYTES) {
    console.error(`  ✗ ${name}.png too small (${bytes} bytes)`);
    process.exit(1);
  }

  console.log(`  ✅ ${name}.png (${(bytes / 1024).toFixed(0)} KB)`);
}

console.log('\nDone — OG PNGs ready in public/');
