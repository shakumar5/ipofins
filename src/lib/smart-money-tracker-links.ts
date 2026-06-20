import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { smartMoneyTabPath } from './smart-money-meta';
import {
  TRACKER_BASE_PATH,
  trackerPathFromViewMonth,
  type TrackerViewType,
} from './smart-money-tracker-meta';

export interface SmartMoneyTrackerLinks {
  hub: string;
  latestMonth: string;
  mostBought: string;
  mostSold: string;
  freshEntries: string;
  completeExits: string;
  signals: string;
  stockSignal: string;
  sectorIntelligence: string;
  holdingsChanges: string;
}

const FALLBACK_MONTH = 'May 2026';

function trackerPath(view: TrackerViewType, month: string): string {
  return trackerPathFromViewMonth(view, month);
}

/** Build Smart Money hub, tracker deep links, and tab URLs from the latest tracker index month. */
export function loadSmartMoneyTrackerLinks(cwd = process.cwd()): SmartMoneyTrackerLinks {
  let latestMonth = FALLBACK_MONTH;
  const indexPath = join(cwd, 'public', 'data', 'smart-money-tracker-index.json');

  if (existsSync(indexPath)) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
        months?: { label: string }[];
      };
      latestMonth = index.months?.[0]?.label || latestMonth;
    } catch {
      /* use fallback month */
    }
  }

  return {
    hub: TRACKER_BASE_PATH,
    latestMonth,
    mostBought: trackerPath('most_bought', latestMonth),
    mostSold: trackerPath('most_sold', latestMonth),
    freshEntries: trackerPath('fresh_entries', latestMonth),
    completeExits: trackerPath('complete_exits', latestMonth),
    signals: smartMoneyTabPath('signals'),
    stockSignal: smartMoneyTabPath('stock-signal'),
    sectorIntelligence: smartMoneyTabPath('sectors'),
    holdingsChanges: '/mutual-funds/mutual-fund-holdings-changes',
  };
}
