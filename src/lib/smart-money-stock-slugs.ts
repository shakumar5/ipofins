import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { categoryFileSlug, monthFileSlug } from './client-data';

export interface SmartMoneyStockSlug {
  slug: string;
  stockName: string;
}

/** Collect unique stock slugs from exported smart-money-signals JSON (build / sitemap). */
export function loadSmartMoneyStockSlugs(cwd = process.cwd()): SmartMoneyStockSlug[] {
  const dataDir = join(cwd, 'public', 'data');
  const indexPath = join(dataDir, 'smart-money-signals-index.json');
  if (!existsSync(indexPath)) return [];

  const index = JSON.parse(readFileSync(indexPath, 'utf-8')) as {
    months: string[];
    categories?: string[];
    layout?: string;
  };

  const bySlug = new Map<string, string>();
  const signalsDir = join(dataDir, 'smart-money-signals');
  if (!existsSync(signalsDir)) return [];

  const ingest = (rows: { stockSlug?: string; stockName?: string }[]) => {
    for (const row of rows) {
      if (!row.stockSlug || !row.stockName) continue;
      if (!bySlug.has(row.stockSlug)) bySlug.set(row.stockSlug, row.stockName);
    }
  };

  if (index.layout === 'by-category' && index.categories?.length) {
    for (const month of index.months) {
      for (const category of index.categories) {
        const monthPath = join(
          signalsDir,
          `${monthFileSlug(month)}--${categoryFileSlug(category)}.json`,
        );
        if (!existsSync(monthPath)) continue;
        const file = JSON.parse(readFileSync(monthPath, 'utf-8')) as {
          rows?: { stockSlug: string; stockName: string }[];
        };
        ingest(file.rows || []);
      }
    }
  } else {
    for (const fileName of readdirSync(signalsDir)) {
      if (!fileName.endsWith('.json')) continue;
      const file = JSON.parse(readFileSync(join(signalsDir, fileName), 'utf-8')) as {
        rows?: { stockSlug: string; stockName: string }[];
      };
      ingest(file.rows || []);
    }
  }

  return [...bySlug.entries()]
    .map(([slug, stockName]) => ({ slug, stockName }))
    .sort((a, b) => a.stockName.localeCompare(b.stockName));
}
