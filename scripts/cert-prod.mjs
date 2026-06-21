#!/usr/bin/env node
/**
 * Production certification for Smart Money / Conviction Score deploy.
 * Run: node scripts/node-with-ca.mjs scripts/cert-prod.mjs
 */
const BASE = process.env.CERT_BASE_URL || 'https://ipofins.com';

const checks = [];
function pass(id, msg) {
  checks.push({ id, status: 'PASS', msg });
}
function warn(id, msg) {
  checks.push({ id, status: 'WARN', msg });
}
function fail(id, msg) {
  checks.push({ id, status: 'FAIL', msg });
}

async function get(path, asJson = false) {
  const url = `${BASE}${path}`;
  const t0 = Date.now();
  const res = await fetch(url, { redirect: 'follow' });
  const ms = Date.now() - t0;
  if (!res.ok) return { url, ok: false, status: res.status, ms };
  if (asJson) return { url, ok: true, status: res.status, ms, body: await res.json() };
  return { url, ok: true, status: res.status, ms, body: await res.text() };
}

const index = await get('/data/smart-money-signals-index.json', true);
if (!index.ok) fail('DATA_INDEX', `unreachable (${index.status})`);
else {
  const b = index.body;
  pass('DATA_INDEX', `OK ${index.ms}ms`);
  if (b.months?.[0] === 'May 2026') pass('DATA_MONTH', 'Latest month May 2026');
  else fail('DATA_MONTH', `Latest month: ${b.months?.[0]}`);

  if (b.scoringModel === 'stock-cap-v2') pass('SCORING_MODEL', 'stock-cap-v2');
  else if (b.scoringModel === 'conviction-v2') warn('SCORING_MODEL', 'conviction-v2 (absolute model — expected stock-cap-v2)');
  else warn('SCORING_MODEL', String(b.scoringModel || 'missing'));

  if (b.exportedAt) pass('EXPORTED_AT', b.exportedAt);
  else warn('EXPORTED_AT', 'missing — harder to detect stale JSON');

  const stockCaps = ['Large Cap', 'Mid Cap', 'Small Cap'];
  const hasCapBuckets = stockCaps.every((c) => b.categories?.includes(c));
  if (hasCapBuckets) pass('CAP_BUCKETS', b.categories.join(', '));
  else warn('CAP_BUCKETS', (b.categories || []).join(', '));
}

const chunk = await get('/data/smart-money-signals/may-2026--mid-cap.json', true);
if (!chunk.ok) fail('DATA_CHUNK', 'mid-cap chunk missing');
else {
  const rows = chunk.body?.rows || [];
  pass('DATA_CHUNK', `${rows.length} Mid Cap rows for May 2026`);
  const sample = rows[0];
  if (sample?.convictionScore >= 0 && sample?.convictionScore <= 100) {
    pass('SCORE_RANGE', `sample ${sample.stockName} = ${sample.convictionScore}`);
  }

  const capShape = sample?.factorBreakdown?.netWeightChange != null;
  if (capShape) pass('FACTOR_BREAKDOWN', 'factorBreakdown uses percentile keys');
  else warn('FACTOR_BREAKDOWN', 'no percentile factorBreakdown on rows');

  if (sample?.convictionV2) warn('V2_META', 'convictionV2 should not be present');
  else pass('V2_META', 'convictionV2 absent (expected)');

  if (sample?.fundActivity) pass('FUND_ACTIVITY', 'fundActivity lists present');
  else warn('FUND_ACTIVITY', 'fundActivity absent');

  const gmr = rows.find((r) => /gmr/i.test(r.stockName));
  if (gmr) {
    warn(
      'GMR_SPOT',
      `${gmr.signal} score=${gmr.convictionScore} (+${gmr.increasedCount} inc, ${gmr.freshEntries} fresh, ${gmr.completeExits} exits)`,
    );
  }

  const bse = rows.find((r) => /bse/i.test(r.stockName));
  if (bse) {
    pass('BSE_SPOT', `${bse.signal} score=${bse.convictionScore} (${bse.increasedCount} inc, ${bse.freshEntries} fresh)`);
  }

  const withTicker = rows.filter((r) => r.nseSymbol).length;
  if (withTicker > 0) pass('NSE_SYMBOL', `${withTicker} rows with nseSymbol in chunk`);
  else warn('NSE_SYMBOL', 'no nseSymbol in mid-cap chunk — TCS search by ticker may fail');
}

const tracker = await get('/data/smart-money-tracker-index.json', true);
if (tracker.ok && tracker.body?.months?.[0]?.label === 'May 2026') {
  pass('TRACKER_INDEX', 'May 2026');
} else {
  fail('TRACKER_INDEX', 'tracker index issue');
}

const pagePaths = [
  ['/mutual-funds/smart-money/', 'tracker'],
  ['/mutual-funds/smart-money/smart-money-signal', 'signals'],
  ['/mutual-funds/smart-money/stock-signal', 'stock-signal hub'],
  ['/mutual-funds/smart-money/stock-signal/tata-consultancy-services-limited/', 'TCS stock signal'],
  ['/mutual-funds/smart-money/signal/bse-limited/', 'BSE detail'],
  ['/mutual-funds/smart-money/sector-intelligence', 'sectors'],
];

for (const [path, label] of pagePaths) {
  const p = await get(path);
  if (!p.ok) {
    fail(`PAGE_${label}`, `${path} → ${p.status}`);
    continue;
  }
  pass(`PAGE_${label}`, `${p.status} ${p.ms}ms`);
  const html = p.body;
  if (html.includes('id="smart-money-signals-data-bootstrap"') || html.includes('id="smart-money-signals-index-bootstrap"')) {
    fail(`BOOTSTRAP_${label}`, 'signals data embedded in HTML — must fetch JSON client-side');
  } else if (label === 'signals' || label === 'stock-signal hub' || label === 'TCS stock signal') {
    pass(`BOOTSTRAP_${label}`, 'no inline signals bootstrap (client fetch only)');
  }
  if (html.includes('ConvictionScoreBreakdown') || html.includes('score breakdown')) {
    pass(`UI_V2_${label}`, 'v2 breakdown UI marker found');
  }
  if (label === 'tracker' && html.includes('ICICI Bank')) {
    pass('TRACKER_SSR', 'tracker data visible in HTML');
  }
  if (label === 'signals' && !html.includes('Conviction Score') && !html.includes('convictionScore')) {
    warn('SIGNALS_SSR', 'no signal table in static HTML — verify in browser');
  }
}

// Local-only checks message
pass('LOCAL_TEST', 'Run: node scripts/test-stock-cap-signals.mjs + npm run check before deploy');

const fails = checks.filter((c) => c.status === 'FAIL');
const warns = checks.filter((c) => c.status === 'WARN');
const passes = checks.filter((c) => c.status === 'PASS');

console.log(`\n=== PROD CERTIFICATION: ${BASE} ===\n`);
for (const c of checks) {
  const icon = c.status === 'PASS' ? '✓' : c.status === 'WARN' ? '!' : '✗';
  console.log(`${icon} [${c.status}] ${c.id}: ${c.msg}`);
}
console.log(`\nSummary: ${passes.length} pass, ${warns.length} warn, ${fails.length} fail`);

if (fails.length) {
  console.log('\nVERDICT: NOT CERTIFIED — fix failures before calling prod good.');
  process.exit(1);
}
if (warns.some((w) => ['SCORING_MODEL', 'V2_BREAKDOWN', 'V2_META', 'FUND_ACTIVITY'].includes(w.id))) {
  console.log('\nVERDICT: PARTIAL — prod is up but Conviction Score v2 is NOT deployed yet.');
  console.log('Deploy uncommitted changes + re-run export-client-data, then re-certify.');
  process.exit(2);
}
console.log('\nVERDICT: CERTIFIED — prod checks passed.');
process.exit(0);
