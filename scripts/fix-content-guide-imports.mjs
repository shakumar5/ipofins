/** Patch top-stocks page to use TopStocksGuide. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '..', 'src/pages/top-stocks/[source]/[cap]/[flow].astro');
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import TopStocksInternalLinks from '../../../../components/top-stocks/TopStocksInternalLinks.astro';",
  "import TopStocksGuide from '../../../../components/top-stocks/TopStocksGuide.astro';",
);
if (!s.includes('DEFAULT_TOP_STOCKS_FILTERS')) {
  s = s.replace(
    '  topStocksPath,\n  TOP_STOCKS_SOURCE_SLUGS,',
    '  topStocksPath,\n  DEFAULT_TOP_STOCKS_FILTERS,\n  TOP_STOCKS_SOURCE_SLUGS,',
  );
}
s = s.replace('<TopStocksInternalLinks />', '<TopStocksGuide />');
fs.writeFileSync(p, s, 'utf8');
console.log('Patched top-stocks page');

