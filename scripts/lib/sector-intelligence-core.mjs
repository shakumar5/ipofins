/** Sector Intelligence scoring — Node build/export copy (mirrors src/lib/sector-intelligence.ts). */

import { scoreToSignal } from './smart-money-signals-core.mjs';

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TREND_FLAT_THRESHOLD_PPT = 0.05;

function sectorToSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function monthIndex(label) {
  const [m, y] = label.split(' ');
  return Number(y) * 12 + MONTH_ORDER.indexOf(m);
}

function sortMonthLabels(months) {
  return [...months].sort((a, b) => monthIndex(a) - monthIndex(b));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function percentileRank(value, values) {
  if (!values.length) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  const equal = sorted.filter((v) => v === value).length;
  return round2(((below + equal * 0.5) / sorted.length) * 100);
}

function computeTrend(history, latestMonth) {
  const sorted = sortMonthLabels(history.map((h) => h.month));
  const byMonth = Object.fromEntries(history.map((h) => [h.month, h.pctOfEquity]));
  const idx = sorted.indexOf(latestMonth);
  if (idx < 0) return { direction: 'flat', months: 0, label: '→' };

  let up = 0;
  for (let i = idx; i > 0; i--) {
    const curr = byMonth[sorted[i]];
    const prev = byMonth[sorted[i - 1]];
    if (curr == null || prev == null) break;
    const delta = curr - prev;
    if (delta > TREND_FLAT_THRESHOLD_PPT) up++;
    else if (delta < -TREND_FLAT_THRESHOLD_PPT) break;
    else break;
  }

  let down = 0;
  for (let i = idx; i > 0; i--) {
    const curr = byMonth[sorted[i]];
    const prev = byMonth[sorted[i - 1]];
    if (curr == null || prev == null) break;
    const delta = curr - prev;
    if (delta < -TREND_FLAT_THRESHOLD_PPT) down++;
    else if (delta > TREND_FLAT_THRESHOLD_PPT) break;
    else break;
  }

  if (up > 0) return { direction: 'up', months: up, label: `↑ ${up}M` };
  if (down > 0) return { direction: 'down', months: down, label: `↓ ${down}M` };
  return { direction: 'flat', months: 0, label: '→' };
}

export function buildSectorIntelligence(input) {
  const minSectorPct = input.minSectorPct ?? 0.1;
  const months = sortMonthLabels([...new Set(input.sectorMonths.map((r) => r.month))]);
  if (months.length < 2) return null;

  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];

  const bySectorMonth = new Map();
  for (const row of input.sectorMonths) {
    if (!bySectorMonth.has(row.sector)) bySectorMonth.set(row.sector, new Map());
    bySectorMonth.get(row.sector).set(row.month, {
      totalValue: row.totalValue,
      fundCount: row.fundCount,
    });
  }

  const monthTotals = new Map();
  for (const row of input.sectorMonths) {
    monthTotals.set(row.month, (monthTotals.get(row.month) || 0) + row.totalValue);
  }

  const changeLookup = new Map();
  for (const c of input.sectorFundChanges || []) {
    if (c.month === currentMonth) changeLookup.set(c.sector, c);
  }

  const candidates = [];

  for (const [sector, monthMap] of bySectorMonth) {
    const curr = monthMap.get(currentMonth);
    const prev = monthMap.get(previousMonth);
    if (!curr || !prev || prev.totalValue <= 0) continue;

    const totalEquity = monthTotals.get(currentMonth) || 0;
    const currentPct = totalEquity > 0 ? (curr.totalValue / totalEquity) * 100 : 0;
    if (currentPct < minSectorPct) continue;

    const prevTotalEquity = monthTotals.get(previousMonth) || 0;
    const previousPct = prevTotalEquity > 0 ? (prev.totalValue / prevTotalEquity) * 100 : 0;
    const aumChangePct = ((curr.totalValue - prev.totalValue) / prev.totalValue) * 100;
    const weightChangePpt = currentPct - previousPct;

    const history = months
      .map((m) => {
        const snap = monthMap.get(m);
        const tot = monthTotals.get(m) || 0;
        return snap && tot > 0
          ? { month: m, pctOfEquity: (snap.totalValue / tot) * 100 }
          : null;
      })
      .filter(Boolean);

    const trend = computeTrend(history, currentMonth);
    const changes = changeLookup.get(sector);

    candidates.push({
      sector,
      sectorSlug: sectorToSlug(sector),
      aumChangePct: round2(aumChangePct),
      weightChangePpt: round2(weightChangePpt),
      currentPct: round2(currentPct),
      previousPct: round2(previousPct),
      currentValue: round2(curr.totalValue),
      previousValue: round2(prev.totalValue),
      fundCount: curr.fundCount,
      fundsIncreasing: changes?.fundsIncreasing ?? 0,
      fundsDecreasing: changes?.fundsDecreasing ?? 0,
      trendDirection: trend.direction,
      trendMonths: trend.months,
      trendLabel: trend.label,
    });
  }

  if (!candidates.length) return null;

  const aumChanges = candidates.map((c) => c.aumChangePct);
  const breadthRatios = candidates.map((c) =>
    c.fundCount > 0 ? c.fundsIncreasing / c.fundCount : 0,
  );

  const scored = candidates.map((c) => {
    const aumPctile = percentileRank(c.aumChangePct, aumChanges);
    const breadthPctile = percentileRank(
      c.fundCount > 0 ? c.fundsIncreasing / c.fundCount : 0,
      breadthRatios,
    );
    const convictionScore = Math.round(aumPctile * 0.75 + breadthPctile * 0.25);
    const { signal, emoji } = scoreToSignal(convictionScore);
    return {
      ...c,
      convictionScore,
      signal,
      signalEmoji: emoji,
    };
  });

  scored.sort((a, b) => b.convictionScore - a.convictionScore || b.aumChangePct - a.aumChangePct);

  return {
    currentMonth,
    previousMonth,
    fundCount: Math.max(
      ...input.sectorMonths.filter((r) => r.month === currentMonth).map((r) => r.fundCount),
    ),
    totalEquityAum: round2(monthTotals.get(currentMonth) || 0),
    minSectorPct,
    rows: scored.map((row, i) => ({ ...row, rank: i + 1 })),
    generatedAt: new Date().toISOString(),
  };
}
