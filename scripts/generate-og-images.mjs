/**
 * Rasterize public/og-*.svg → og-*.png (1200×630) for social meta tags.
 * Run: node scripts/generate-og-images.mjs
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const WIDTH = 1200;
const HEIGHT = 630;

const { default: sharp } = await import('sharp');

const files = ['og-default', 'og-ipo', 'og-fund'];

for (const name of files) {
  const svgPath = join(PUBLIC, `${name}.svg`);
  const pngPath = join(PUBLIC, `${name}.png`);
  await sharp(svgPath).resize(WIDTH, HEIGHT).png().toFile(pngPath);
  console.log(`  ✅ ${name}.png`);
}

console.log('\nDone — OG PNGs ready in public/');
