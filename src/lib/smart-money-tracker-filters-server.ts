import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { loadSmartMoneyStaticSegments } from './smart-money-static-segments';
import { trackerCategorySlug } from './smart-money-tracker-filters-meta';

export function loadTrackerCategoryPathParams(cwd = process.cwd()): {
  segment: string;
  categorySlug: string;
  categoryName: string;
}[] {
  const segments = loadSmartMoneyStaticSegments(cwd).filter((s) => s.includes('-in-'));
  const indexPath = join(cwd, 'public', 'data', 'smart-money-tracker-index.json');
  let categories: string[] = [];
  if (existsSync(indexPath)) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { categories?: string[] };
      categories = (index.categories || []).filter((c) => c && c !== 'All');
    } catch {
      categories = [];
    }
  }

  const paths: { segment: string; categorySlug: string; categoryName: string }[] = [];
  for (const segment of segments) {
    for (const categoryName of categories) {
      const slug = trackerCategorySlug(categoryName);
      if (!slug) continue;
      paths.push({ segment, categorySlug: slug, categoryName });
    }
  }
  return paths;
}
