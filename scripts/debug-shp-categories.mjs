import { parsePct } from './lib/shp-xbrl-parser.mjs';

const url = process.argv[2] || 'https://nsearchives.nseindia.com/corporate/xbrl/SHP_1655807_21042026113753_WEB.xml';
const xml = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();

const PCT_TAGS = [
  'ShareholdingAsAPercentageOfTotalNumberOfShares',
  'ShareholdingAsAPercentageOfTotalNumberOfSharesCalculatedAsPerSCRR1957AsAPercentageOfABPlusC2',
  'ShareholdingAsAPercentageOfTotalNumberOfSharesOfTheCompany',
];

const contexts = [...xml.matchAll(/<xbrli:context id="([^"]+)"/g)].map((m) => m[1]);
const categoryCtxs = contexts.filter((id) => id.endsWith('_ContextI') && !id.startsWith('D_'));

for (const ctx of categoryCtxs) {
  const fields = {};
  const re = new RegExp(`<in-bse-shp:([A-Za-z0-9]+)[^>]*contextRef="${ctx}"[^>]*>([^<]*)</in-bse-shp:\\1>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) fields[m[1]] = m[2].trim();
  const pctTag = PCT_TAGS.find((t) => fields[t]);
  const pct = pctTag ? parsePct(fields[pctTag]) : null;
  if (pct != null && pct > 0.01) {
    console.log(ctx.replace('_ContextI', ''), '=', pct.toFixed(2) + '%');
  }
}
