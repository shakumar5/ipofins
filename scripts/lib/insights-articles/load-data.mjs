import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function loadInsightsData(cwd = process.cwd()) {
  const dataDir = join(cwd, 'public', 'data');
  const trackerIndex = readJson(join(dataDir, 'smart-money-tracker-index.json'));
  const sectorIntel = readJson(join(dataDir, 'sector-intelligence.json'));
  const signalsIndex = readJson(join(dataDir, 'smart-money-signals-index.json'));
  const overlapByFund = readJson(join(dataDir, 'fund-overlaps-by-fund.json'));
  const overlapIndex = readJson(join(dataDir, 'fund-overlap-index.json'));
  const topStocks = readJson(join(dataDir, 'top-stocks.json'));
  const sast = readJson(join(dataDir, 'sast-updates.json'));
  const holdingsCompare = readJson(join(dataDir, 'holdings-compare-index.json'));
  const portfolioOverlap = readJson(join(dataDir, 'portfolio-overlap.json'));
  const onePercentPositions = readJson(join(dataDir, 'one-percent-holder-positions.json'));
  const fundHoldingsAliases = readJson(join(dataDir, 'fund-holdings-aliases.json'));

  const latestMonth =
    sectorIntel?.currentMonth ||
    trackerIndex?.months?.[0]?.label ||
    trackerIndex?.months?.[0] ||
    signalsIndex?.months?.[0] ||
    overlapByFund?.month ||
    null;

  let trackerMonth = null;
  if (latestMonth) {
    const slug = String(latestMonth).toLowerCase().replace(/\s+/g, '-');
    trackerMonth = readJson(join(dataDir, 'smart-money-tracker', `${slug}.json`));
  }

  const signalRows = [];
  if (latestMonth && signalsIndex?.categories?.length) {
    const mSlug = String(latestMonth).toLowerCase().replace(/\s+/g, '-');
    const signalsDir = join(dataDir, 'smart-money-signals');
    for (const category of signalsIndex.categories) {
      const catSlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const file = join(signalsDir, `${mSlug}--${catSlug}.json`);
      const payload = readJson(file);
      if (payload?.rows?.length) {
        for (const row of payload.rows) {
          signalRows.push({ ...row, month: payload.month || latestMonth, category });
        }
      }
    }
  }

  const nameBySlug = new Map((overlapIndex || []).map((f) => [f.slug, f.name]));

  return {
    latestMonth,
    prevMonth: sectorIntel?.previousMonth || trackerMonth?.prevMonth || null,
    trackerIndex,
    trackerMonth,
    sectorIntel,
    signalsIndex,
    signalRows,
    overlapByFund,
    overlapIndex,
    nameBySlug,
    topStocks,
    sast,
    holdingsCompare,
    portfolioOverlap,
    onePercentPositions,
    fundHoldingsAliases,
    generatedAt: new Date().toISOString(),
  };
}
