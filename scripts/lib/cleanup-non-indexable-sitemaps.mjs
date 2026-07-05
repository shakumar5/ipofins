/** Remove overlap/staging sitemap XML — not part of GSC sitemap-index (~15k URLs). */
import { existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const NON_INDEXABLE_SITEMAP_RE = /^(sitemap-portfolio-overlap(-\d+)?|sitemap-overlap-staging-\d+)\.xml$/;

export function removeNonIndexableSitemapFiles(dir) {
  if (!existsSync(dir)) return 0;

  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!NON_INDEXABLE_SITEMAP_RE.test(name)) continue;
    unlinkSync(join(dir, name));
    removed += 1;
  }
  return removed;
}
