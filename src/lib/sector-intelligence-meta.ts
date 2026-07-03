import type { PageMeta } from './page-meta';
import { withBrandSuffix } from './brand';
import { getSmartMoneyPageMeta } from './smart-money-meta';

export const SECTOR_INTELLIGENCE_BASE = '/mutual-funds/smart-money/sector-intelligence';

export function sectorIntelligencePath(sectorSlug?: string): string {
  if (!sectorSlug) return SECTOR_INTELLIGENCE_BASE;
  return `${SECTOR_INTELLIGENCE_BASE}/${sectorSlug}`;
}

export function parseSectorIntelligenceSlugFromPathname(pathname: string): string | null {
  const prefix = `${SECTOR_INTELLIGENCE_BASE}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/\/$/, '');
  if (!rest || rest.includes('/')) return null;
  return decodeURIComponent(rest);
}

export function getSectorIntelligencePageMeta(
  sectorName?: string,
  sectorSlug?: string,
  currentMonth?: string,
): PageMeta {
  if (sectorName && sectorSlug) {
    const monthBit = currentMonth ? ` — ${currentMonth}` : '';
    return {
      title: withBrandSuffix(`${sectorName} MF Sector Intelligence${monthBit}`),
      description: `Mutual fund sector rotation in ${sectorName}: month-on-month AUM change, portfolio weight shift, conviction score, and top stock moves from AMC disclosures.`,
      path: sectorIntelligencePath(sectorSlug),
      heading: sectorName,
      subtitle: `How mutual funds are allocating to ${sectorName} — conviction, AUM momentum, and fund breadth.`,
      breadcrumbLabel: sectorName,
    };
  }
  return getSmartMoneyPageMeta('sectors');
}
