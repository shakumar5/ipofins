import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { SMART_MONEY_BASE_PATH } from './smart-money-meta';
import {
  TRACKER_VIEW_OPTIONS,
  trackerSegmentFromViewMonth,
} from './smart-money-tracker-meta';

const TAB_SEGMENTS = ['smart-money-signal', 'sector-intelligence'];

/** Static path segments for Smart Money tracker views and tab pages (excludes stock-signal/ and signal/). */
export function loadSmartMoneyStaticSegments(cwd = process.cwd()): string[] {
  const segments = new Set<string>(TAB_SEGMENTS);
  const indexPath = join(cwd, 'public', 'data', 'smart-money-tracker-index.json');

  if (existsSync(indexPath)) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
        months?: { label: string }[] | string[];
      };
      const months = (index.months || []).map((m) => (typeof m === 'string' ? m : m.label)).filter(Boolean);
      for (const month of months) {
        for (const view of TRACKER_VIEW_OPTIONS) {
          segments.add(trackerSegmentFromViewMonth(view.id, month));
        }
      }
    } catch {
      /* fallback months below */
    }
  }

  if (segments.size === TAB_SEGMENTS.length) {
    for (const view of TRACKER_VIEW_OPTIONS) {
      segments.add(trackerSegmentFromViewMonth(view.id, 'May 2026'));
    }
  }

  return [...segments].sort();
}

export function smartMoneyPathFromSegment(segment: string): string {
  return `${SMART_MONEY_BASE_PATH}/${segment}`;
}
