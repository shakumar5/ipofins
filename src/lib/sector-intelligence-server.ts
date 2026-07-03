/**
 * Sector Intelligence — build-time JSON loader (no Neon required).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { monthFileSlug } from './client-data';
import type { SmartMoneyMonthData } from './data/holdings';
import type { SectorIntelligenceData, SectorIntelligenceRow } from './sector-intelligence';

export interface SectorIntelligenceSlug {
  slug: string;
  sectorName: string;
}

export const SECTOR_INTELLIGENCE_JSON_PATH = '/data/sector-intelligence.json';

function dataPath(cwd: string): string {
  return join(cwd, 'public', 'data', 'sector-intelligence.json');
}

export function readSectorIntelligenceFromDisk(cwd = process.cwd()): SectorIntelligenceData | null {
  const path = dataPath(cwd);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SectorIntelligenceData;
  } catch {
    return null;
  }
}

export function loadSectorIntelligenceSlugs(cwd = process.cwd()): SectorIntelligenceSlug[] {
  const data = readSectorIntelligenceFromDisk(cwd);
  if (!data?.rows?.length) return [];
  return data.rows
    .map((row) => ({ slug: row.sectorSlug, sectorName: row.sector }))
    .sort((a, b) => a.sectorName.localeCompare(b.sectorName));
}

export function findSectorIntelligenceRow(
  sectorSlug: string,
  data?: SectorIntelligenceData | null,
): SectorIntelligenceRow | null {
  const payload = data ?? readSectorIntelligenceFromDisk();
  return payload?.rows.find((row) => row.sectorSlug === sectorSlug) ?? null;
}

let trackerMonthCache: SmartMoneyMonthData | null | undefined;

/** Load tracker month JSON aligned with sector-intelligence currentMonth (cached per build). */
export function loadTrackerMonthMovesForSectorIntel(cwd = process.cwd()): SmartMoneyMonthData | null {
  if (trackerMonthCache !== undefined) return trackerMonthCache;

  const sectorData = readSectorIntelligenceFromDisk(cwd);
  const month = sectorData?.currentMonth;
  if (!month) {
    trackerMonthCache = null;
    return null;
  }

  const path = join(cwd, 'public', 'data', 'smart-money-tracker', `${monthFileSlug(month)}.json`);
  if (!existsSync(path)) {
    trackerMonthCache = null;
    return null;
  }

  try {
    const file = JSON.parse(readFileSync(path, 'utf-8')) as {
      month: string;
      prevMonth: string;
      increased: SmartMoneyMonthData['increased'];
      decreased: SmartMoneyMonthData['decreased'];
      fresh_entry: SmartMoneyMonthData['fresh_entry'];
      complete_exit: SmartMoneyMonthData['complete_exit'];
    };
    trackerMonthCache = {
      month: file.month,
      prevMonth: file.prevMonth,
      increased: file.increased,
      decreased: file.decreased,
      fresh_entry: file.fresh_entry,
      complete_exit: file.complete_exit,
    };
  } catch {
    trackerMonthCache = null;
  }

  return trackerMonthCache;
}