import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { signalCategorySlug, signalTypeSlug } from './smart-money-signals-list-meta';
import { SIGNAL_OPTIONS } from './smart-money-signals';

export function loadSignalIndexCategories(cwd = process.cwd()): string[] {
  const indexPath = join(cwd, 'public', 'data', 'smart-money-signals-index.json');
  if (!existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { categories?: string[] };
    return index.categories ?? [];
  } catch {
    return [];
  }
}

/** Build filter path segments for getStaticPaths (build-time only). */
export function loadSmartMoneySignalFilterPathParams(cwd = process.cwd()): string[] {
  const indexPath = join(cwd, 'public', 'data', 'smart-money-signals-index.json');
  if (!existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      months?: string[];
      categories?: string[];
    };
    const months = index.months || [];
    const categories = index.categories || [];
    const paths: string[] = [];
    for (const month of months) {
      const mSlug = month.toLowerCase().replace(/\s+/g, '-');
      paths.push(mSlug);
      for (const category of categories) {
        paths.push(`${mSlug}/${signalCategorySlug(category)}`);
        for (const opt of SIGNAL_OPTIONS) {
          if (opt.value === 'All') continue;
          paths.push(`${mSlug}/${signalCategorySlug(category)}/${signalTypeSlug(opt.value)}`);
        }
      }
    }
    return paths;
  } catch {
    return [];
  }
}
