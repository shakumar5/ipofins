/**
 * Build sector-intelligence.json — sector rotation across all fund holdings.
 */
import { isDebtInstrument, isValidEquitySector } from './stock-utils.mjs';
import { buildSectorIntelligence } from '../../src/lib/sector-intelligence.ts';

export async function buildSectorIntelligenceExport(sql) {
  const monthRows = await sql`
    SELECT DISTINCT month, TRIM(TO_CHAR(month, 'FMMonth YYYY')) AS month_label
    FROM fund_holdings
    ORDER BY month DESC
    LIMIT 12
  `;
  if (monthRows.length < 2) {
    return { currentMonth: '', previousMonth: '', fundCount: 0, totalEquityAum: 0, minSectorPct: 0.1, rows: [], generatedAt: new Date().toISOString() };
  }

  const months = monthRows.map((r) => r.month).reverse();
  const monthLabels = monthRows.map((r) => String(r.month_label).trim()).reverse();

  const allocationRows = await sql`
    SELECT
      TRIM(TO_CHAR(fh.month, 'FMMonth YYYY')) AS month_label,
      COALESCE(sec.name, 'Unknown') AS sector,
      fh.fund_id,
      SUM(COALESCE(fh.market_value, 0))::float AS total_value
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id AND f.is_active = true
    JOIN stocks s ON s.id = fh.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE fh.month = ANY(${months})
      AND EXISTS (SELECT 1 FROM fund_holdings fh2 WHERE fh2.fund_id = f.id LIMIT 1)
    GROUP BY fh.month, sec.name, fh.fund_id
  `;

  const sectorMonthMap = new Map();
  const fundIdsByMonth = new Map();

  for (const r of allocationRows) {
    const sector = String(r.sector);
    const month = String(r.month_label).trim();
    const stockName = '';
    if (isDebtInstrument(stockName, sector)) continue;
    if (!isValidEquitySector(sector) || sector === 'Unknown') continue;

    const key = `${month}|${sector}`;
    if (!sectorMonthMap.has(key)) {
      sectorMonthMap.set(key, { month, sector, totalValue: 0, fundIds: new Set() });
    }
    const bucket = sectorMonthMap.get(key);
    bucket.totalValue += Number(r.total_value) || 0;
    bucket.fundIds.add(Number(r.fund_id));

    if (!fundIdsByMonth.has(month)) fundIdsByMonth.set(month, new Set());
    fundIdsByMonth.get(month).add(Number(r.fund_id));
  }

  const sectorMonths = [];
  for (const bucket of sectorMonthMap.values()) {
    sectorMonths.push({
      month: bucket.month,
      sector: bucket.sector,
      totalValue: bucket.totalValue,
      fundCount: bucket.fundIds.size,
    });
  }

  const latestLabel = monthLabels[monthLabels.length - 1];
  const changeRows = await sql`
    SELECT
      TRIM(TO_CHAR(hc.month, 'FMMonth YYYY')) AS month_label,
      COALESCE(sec.name, 'Unknown') AS sector,
      hc.change_type,
      hc.fund_id
    FROM holdings_changes hc
    JOIN funds f ON f.id = hc.fund_id AND f.is_active = true
    JOIN stocks s ON s.id = hc.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE hc.month = (SELECT MAX(month) FROM holdings_changes)
      AND hc.change_type IN ('increased', 'decreased')
      AND EXISTS (SELECT 1 FROM fund_holdings fh WHERE fh.fund_id = f.id LIMIT 1)
  `;

  const sectorChangeMap = new Map();
  for (const r of changeRows) {
    const sector = String(r.sector);
    if (!isValidEquitySector(sector) || sector === 'Unknown') continue;
    if (!sectorChangeMap.has(sector)) {
      sectorChangeMap.set(sector, { increasing: new Set(), decreasing: new Set() });
    }
    const bucket = sectorChangeMap.get(sector);
    const fundId = Number(r.fund_id);
    if (r.change_type === 'increased') bucket.increasing.add(fundId);
    if (r.change_type === 'decreased') bucket.decreasing.add(fundId);
  }

  const sectorFundChanges = [...sectorChangeMap.entries()].map(([sector, counts]) => ({
    month: latestLabel,
    sector,
    fundsIncreasing: counts.increasing.size,
    fundsDecreasing: counts.decreasing.size,
  }));

  const result = buildSectorIntelligence({ sectorMonths, sectorFundChanges, minSectorPct: 0.1 });
  if (!result) {
    return { currentMonth: '', previousMonth: '', fundCount: 0, totalEquityAum: 0, minSectorPct: 0.1, rows: [], generatedAt: new Date().toISOString() };
  }

  const distinctFunds = fundIdsByMonth.get(result.currentMonth)?.size ?? 0;
  return { ...result, fundCount: distinctFunds };
}
