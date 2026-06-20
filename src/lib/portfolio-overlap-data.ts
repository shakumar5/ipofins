import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface PortfolioOverlapFund {
  slug: string;
  name: string;
  amc: string;
}

export interface PortfolioOverlapExport {
  month: string;
  funds: PortfolioOverlapFund[];
}

/** Load exported portfolio overlap JSON for build-time SSR meta. */
export function loadPortfolioOverlapExport(cwd = process.cwd()): PortfolioOverlapExport | null {
  const path = join(cwd, 'public', 'data', 'portfolio-overlap.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PortfolioOverlapExport;
  } catch {
    return null;
  }
}
