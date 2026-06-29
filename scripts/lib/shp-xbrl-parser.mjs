/**
 * Parse BSE/NSE Shareholding Pattern XBRL (in-bse-shp taxonomy) into holder rows.
 */

const FIELD_RE = /<in-bse-shp:([A-Za-z0-9]+)[^>]*contextRef="([^"]+)"[^>]*>([^<]*)<\/in-bse-shp:\1>/g;
const NAME_RE = /<in-bse-shp:NameOfTheShareholder contextRef="([^"]+)">([^<]+)<\/in-bse-shp:NameOfTheShareholder>/g;

function holderTypeFromContext(ctx, category) {
  const c = `${ctx} ${category || ''}`.toLowerCase();
  if (/promoter/.test(c)) return 'promoter';
  // Promoter-group individuals/HUFs use IndividualsOrHUF axis (distinct from public retail buckets).
  if (/individualsorhuf/.test(c) && !/residentindividual|otherindian|otherforeign|nonresident/.test(c)) {
    return 'promoter';
  }
  if (/foreign|fii|fpi/.test(c)) return 'fii';
  if (/mutual|insurance|dii|bank|institution/.test(c)) return 'dii';
  if (/individual|huf|director/.test(c)) return 'individual';
  return 'public';
}

export function parsePct(raw) {
  const n = parseFloat(String(raw || '').replace(/[%,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Percent points (2.57 = 2.57%, 51.89 = 51.89%).
  if (n > 1) return n;
  // Indian SHP XBRL stores exactly 1% as 1.0 — not 0.01 and not 100.
  if (n === 1) return 1;
  // Decimal fraction (0.0257 = 2.57%).
  const scaled = n * 100;
  if (scaled > 100) return n;
  return scaled;
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
    const sharesRaw = fields.NumberOfFullyPaidUpEquityShares
      || fields.NumberOfShares
      || fields.NumberOfEquitySharesHeldInDematerializedForm
      || fields.TotalNumberOfSharesHeld
      || fields.NumberOfFullyPaidUpEquitySharesHeld
      || fields.TotalNoOfSharesHeld;
    const shares = parseInt(String(sharesRaw || '').replace(/,/g, ''), 10);

    if (pct == null && !Number.isFinite(shares)) continue;

    const category = fields.CategoryOfOtherIndianShareholders
      || fields.CategoryOfOtherForeignShareholders
      || fields.CategoryOfShareholder
      || '';
    const nameFields = byContext.get(nameCtx) || {};
    const hasPromoterShareholdingField = 'TypeOfPromoterShareholding' in nameFields;

    let holderType = holderTypeFromContext(nameCtx, category);
    if (hasPromoterShareholdingField || /promoter/i.test(category)) holderType = 'promoter';

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

const CATEGORY_CTX_MAP = {
  ShareholdingOfPromoterAndPromoterGroup_ContextI: 'promoterPct',
  MutualFundsOrUTI_ContextI: 'mfPct',
  InstitutionsDomestic_ContextI: 'diiTotalPct',
  InstitutionsForeign_ContextI: 'fiiPct',
  PublicShareholding_ContextI: 'publicPct',
  ShareholdingPattern_ContextI: 'totalPct',
};

const PCT_FIELD_TAGS = [
  'ShareholdingAsAPercentageOfTotalNumberOfShares',
  'ShareholdingAsAPercentageOfTotalNumberOfSharesCalculatedAsPerSCRR1957AsAPercentageOfABPlusC2',
  'ShareholdingAsAPercentageOfTotalNumberOfSharesOfTheCompany',
];

/**
 * Parse category-level totals from SHP XBRL (instant contexts ending in _ContextI).
 * @returns {{ promoterPct?: number, diiPct?: number, fiiPct?: number, publicPct?: number, totalPct?: number }}
 */
export function parseShareholdingCategorySummary(xml) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [ctxSuffix, key] of Object.entries(CATEGORY_CTX_MAP)) {
    const fields = {};
    const re = new RegExp(
      `<in-bse-shp:([A-Za-z0-9]+)[^>]*contextRef="${ctxSuffix}"[^>]*>([^<]*)</in-bse-shp:\\1>`,
      'g',
    );
    let m;
    while ((m = re.exec(xml)) !== null) fields[m[1]] = m[2].trim();
    const pctTag = PCT_FIELD_TAGS.find((t) => fields[t]);
    const pct = pctTag ? parsePct(fields[pctTag]) : null;
    if (pct != null) out[key] = pct;
  }
  const mf = out.mfPct ?? 0;
  const diiTotal = out.diiTotalPct ?? 0;
  if (diiTotal > 0) out.diiExMfPct = Math.max(0, Math.round((diiTotal - mf) * 1000) / 1000);
  return out;
}

/** @returns {{ holders: ReturnType<typeof parseShareholdingXbrl>, summary: ReturnType<typeof parseShareholdingCategorySummary> }} */
export function parseShareholdingXbrlBundle(xml, sourceUrl = '') {
  return {
    holders: parseShareholdingXbrl(xml, sourceUrl),
    summary: parseShareholdingCategorySummary(xml),
  };
}
