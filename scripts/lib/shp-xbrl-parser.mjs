/**
 * Parse BSE/NSE Shareholding Pattern XBRL (in-bse-shp taxonomy) into holder rows.
 */

const FIELD_RE = /<in-bse-shp:([A-Za-z0-9]+)[^>]*contextRef="([^"]+)"[^>]*>([^<]*)<\/in-bse-shp:\1>/g;
const NAME_RE = /<in-bse-shp:NameOfTheShareholder contextRef="([^"]+)">([^<]+)<\/in-bse-shp:NameOfTheShareholder>/g;

function holderTypeFromContext(ctx, category) {
  const c = `${ctx} ${category || ''}`.toLowerCase();
  if (/promoter/.test(c)) return 'promoter';
  if (/foreign|fii|fpi/.test(c)) return 'fii';
  if (/mutual|insurance|dii|bank|institution/.test(c)) return 'dii';
  if (/individual|huf|director/.test(c)) return 'individual';
  return 'public';
}

function parsePct(raw) {
  const n = parseFloat(String(raw || '').replace(/[%,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n <= 1 ? n * 100 : n;
}

/** @returns {Array<{holderName:string,holderType:string,shares:number|null,pctOfCompany:number,sourceUrl:string}>} */
export function parseShareholdingXbrl(xml, sourceUrl = '') {
  /** @type {Map<string, Record<string, string>>} */
  const byContext = new Map();
  let m;
  while ((m = FIELD_RE.exec(xml)) !== null) {
    const [, tag, ctx, val] = m;
    if (!byContext.has(ctx)) byContext.set(ctx, {});
    byContext.get(ctx)[tag] = val.trim();
  }

  const rows = [];
  let nm;
  while ((nm = NAME_RE.exec(xml)) !== null) {
    const nameCtx = nm[1];
    const name = nm[2].trim();
    const instantCtx = nameCtx.startsWith('D_') ? nameCtx.slice(2) : nameCtx;
    const fields = { ...(byContext.get(nameCtx) || {}), ...(byContext.get(instantCtx) || {}) };

    const pct = parsePct(
      fields.ShareholdingAsAPercentageOfTotalNumberOfShares
        || fields.ShareholdingAsAPercentageOfTotalNumberOfSharesCalculatedAsPerSCRR1957AsAPercentageOfABPlusC2,
    );
    const sharesRaw = fields.TotalNumberOfSharesHeld
      || fields.NumberOfFullyPaidUpEquitySharesHeld
      || fields.TotalNoOfSharesHeld;
    const shares = parseInt(String(sharesRaw || '').replace(/,/g, ''), 10);

    if (pct == null && !Number.isFinite(shares)) continue;

    const category = fields.CategoryOfOtherIndianShareholders
      || fields.CategoryOfOtherForeignShareholders
      || fields.CategoryOfShareholder
      || '';
    const promoterType = fields.TypeOfPromoterShareholding || '';

    let holderType = holderTypeFromContext(nameCtx, category);
    if (/promoter/i.test(promoterType) || /promoter/i.test(category)) holderType = 'promoter';

    rows.push({
      holderName: name,
      holderType,
      shares: Number.isFinite(shares) ? shares : null,
      pctOfCompany: pct,
      sourceUrl,
    });
  }

  return rows;
}
