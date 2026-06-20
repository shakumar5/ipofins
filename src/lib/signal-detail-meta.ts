import type { PageMeta } from './page-meta';
import { SMART_MONEY_BASE_PATH } from './smart-money-meta';

export function signalDetailPath(stockSlug: string): string {
  return `${SMART_MONEY_BASE_PATH}/signal/${stockSlug}`;
}

export function getSignalDetailPageMeta(stockName: string, stockSlug: string): PageMeta {
  const path = signalDetailPath(stockSlug);
  return {
    title: `${stockName} Smart Money Signal Score Breakdown 2026 | IPOFins`,
    description: `Full conviction score breakdown for ${stockName}: net weight change, buying funds, fresh entries, exits, AMC breadth, and trend factors from mutual fund disclosures.`,
    path,
    heading: `${stockName} — Score Breakdown`,
    subtitle: `Six-factor institutional conviction score and fund activity for ${stockName}.`,
    breadcrumbLabel: stockName,
  };
}
