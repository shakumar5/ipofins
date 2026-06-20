import { getSmartMoneyPageMeta, parseSmartMoneyTabFromPathname } from './smart-money-meta';
import {
  getSmartMoneyTrackerPageMeta,
  parseTrackerFromPathname,
} from './smart-money-tracker-meta';
import {
  loadSmartMoneySignalsBootstrap,
  type SmartMoneySignalsBootstrap,
} from './smart-money-signals-server';
import {
  loadSmartMoneyTrackerBootstrap,
  type SmartMoneyTrackerBootstrap,
} from './smart-money-tracker-server';
import type { PageMeta } from './page-meta';

export interface SmartMoneyPageContext {
  parsed: ReturnType<typeof parseTrackerFromPathname>;
  parsedTab: ReturnType<typeof parseSmartMoneyTabFromPathname>;
  pageMeta: PageMeta;
  trackerBootstrap: SmartMoneyTrackerBootstrap | null;
  signalsBootstrap: SmartMoneySignalsBootstrap | null;
}

/** Resolve SSR page meta for Smart Money hub, tracker deep links, and tab URLs. */
export function resolveSmartMoneyPage(pathname: string): SmartMoneyPageContext {
  const parsed = parseTrackerFromPathname(pathname);
  const parsedTab = parseSmartMoneyTabFromPathname(pathname);
  const defaultMeta = getSmartMoneyPageMeta('tracker');
  const pageMeta = parsed
    ? getSmartMoneyTrackerPageMeta(parsed.view, parsed.monthLabel)
    : parsedTab
      ? getSmartMoneyPageMeta(parsedTab)
      : defaultMeta;

  const trackerBootstrap =
    parsedTab === 'signals' || parsedTab === 'sectors'
      ? null
      : loadSmartMoneyTrackerBootstrap(parsed?.monthLabel ?? null);

  const signalsBootstrap =
    parsedTab === 'signals' || parsedTab === 'stock-signal'
      ? loadSmartMoneySignalsBootstrap()
      : null;

  return { parsed, parsedTab, pageMeta, trackerBootstrap, signalsBootstrap };
}
