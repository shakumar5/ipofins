#!/usr/bin/env node
const url = process.argv[2] || 'https://nsearchives.nseindia.com/corporate/xbrl/SHP_1656226_21042026035436_WEB.xml';
const xml = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();

const nameRe = /<in-bse-shp:NameOfTheShareholder contextRef="([^"]+)">([^<]+)<\/in-bse-shp:NameOfTheShareholder>/g;
const holders = [];
let nm;
while ((nm = nameRe.exec(xml)) !== null) {
  const ctx = nm[1];
  const name = nm[2].trim();
  const instantCtx = ctx.startsWith('D_') ? ctx.slice(2) : ctx;
  const fieldRe = /<in-bse-shp:([A-Za-z0-9]+)[^>]*contextRef="([^"]+)"[^>]*>([^<]*)<\/in-bse-shp:\1>/g;
  let fm;
  while ((fm = fieldRe.exec(xml)) !== null) {
    if (fm[2] !== ctx && fm[2] !== instantCtx) continue;
    fields[fm[1]] = fm[3].trim();
  }
  let pct = parseFloat(
    fields.ShareholdingAsAPercentageOfTotalNumberOfShares
      || fields.ShareholdingAsAPercentageOfTotalNumberOfSharesCalculatedAsPerSCRR1957AsAPercentageOfABPlusC2
      || '',
  );
  if (Number.isFinite(pct) && pct > 0 && pct <= 1) pct *= 100;
  const shares = parseInt(String(fields.TotalNumberOfSharesHeld || fields.NumberOfFullyPaidUpEquitySharesHeld || '').replace(/,/g, ''), 10);
  holders.push({ ctx, name, pct: Number.isFinite(pct) ? pct : null, shares: Number.isFinite(shares) ? shares : null, keys: Object.keys(fields) });
}

const gte1 = holders.filter((h) => h.pct != null && h.pct >= 1);
console.log('total named shareholders:', holders.length);
console.log('>=1%:', gte1.length);
console.log('sample >=1%:', gte1.slice(0, 8));
console.log('sample all fields for first holder:', holders[0]);
if (holders[0]) {
  const ctx = holders[0].ctx;
  const fieldRe = /<in-bse-shp:([A-Za-z0-9]+)[^>]*contextRef="([^"]+)"[^>]*>([^<]*)<\/in-bse-shp:\1>/g;
  let fm;
  while ((fm = fieldRe.exec(xml)) !== null) {
    if (fm[2] === ctx) console.log(' ', fm[1], '=', fm[3]);
  }
}
