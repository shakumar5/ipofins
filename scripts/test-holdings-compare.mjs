/**
 * Browser E2E smoke test for Holdings Changes page.
 * Usage: node scripts/test-holdings-compare.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'test-screenshots');
const URL =
  process.argv[2] || 'https://ipofins.com/mutual-funds/mutual-fund-holdings-changes';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

mkdirSync(OUT_DIR, { recursive: true });

const report = { url: URL, steps: [], errors: [] };

function log(step, ok, detail = '') {
  report.steps.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 120_000,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Dismiss cookie banner if shown — accept so we test real user flow
  page.on('pageerror', (err) => report.errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.errors.push(`console: ${msg.text()}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(3000);

  // Accept cookies if banner visible (real user flow)
  try {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Accept');
      btn?.click();
    });
    await sleep(2000);
  } catch { /* ignore */ }

  await page.screenshot({ path: join(OUT_DIR, '01-page-loaded.png'), fullPage: false });
  log('Page loaded', true, URL);

  const bootstrap = await page.evaluate(() => {
    const el = document.getElementById('holdings-compare-bootstrap');
    if (!el) return null;
    const raw = el.getAttribute('data-json') || el.textContent;
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      return { amcs: d.amcs?.length ?? 0, months: d.months ?? [] };
    } catch {
      return { error: 'parse failed' };
    }
  });
  log('Bootstrap JSON in DOM', Boolean(bootstrap?.amcs), bootstrap ? JSON.stringify(bootstrap) : 'missing');

  const amcSelect = await page.waitForSelector('select', { timeout: 30000 });
  const optionsBefore = await page.evaluate(() => {
    const sel = document.querySelector('select');
    return sel ? Array.from(sel.options).map((o) => o.value).filter(Boolean).length : 0;
  });
  log('AMC dropdown options', optionsBefore > 0, `${optionsBefore} AMCs`);

  // Select HDFC
  await page.select('select', 'HDFC');
  await sleep(1500);
  await page.screenshot({ path: join(OUT_DIR, '02-hdfc-selected.png'), fullPage: false });

  const afterSelect = await page.evaluate(() => {
    const sel = document.querySelector('select');
    return {
      selected: sel?.value ?? '',
      bodyText: document.body.innerText.slice(0, 4000),
    };
  });
  log('AMC dropdown keeps HDFC selection', afterSelect.selected === 'HDFC', `selected=${afterSelect.selected}`);

  // Wait for loading to finish and results or empty state
  let outcome = 'timeout';
  for (let i = 0; i < 40; i++) {
    const state = await page.evaluate(() => {
      const root = document.querySelector('[data-holdings-compare-root]') || document.body;
      const t = root.innerText;
      if (t.includes('Could not load') && t.includes('portfolio data')) return 'error';
      const cards = document.querySelectorAll('h3.font-semibold');
      for (const h of cards) {
        if (h.textContent?.includes('additions')) continue;
        if (h.parentElement?.innerText?.includes('additions •')) return 'results';
      }
      if (document.querySelector('.text-green-700, .dark\\:text-green-400.uppercase')) return 'results';
      const empty = document.querySelector('[data-holdings-empty]');
      if (empty) return 'empty';
      if (t.includes('Loading') && t.includes('portfolio data')) return 'loading';
      return 'waiting';
    });
    if (['results', 'empty', 'error'].includes(state)) {
      outcome = state;
      break;
    }
    await sleep(500);
  }

  await page.screenshot({ path: join(OUT_DIR, '03-after-compare.png'), fullPage: true });
  const passedCompare = outcome === 'results' || outcome === 'empty';
  log('Compare finished (not stuck loading)', passedCompare, `outcome=${outcome}`);
  if (outcome === 'loading') {
    log('Loading cleared after AMC fetch', false, 'Still showing "Loading portfolio data" — deploy the latest HoldingsCompare fix');
  }

  if (outcome === 'results') {
    const sample = await page.evaluate(() => {
      const h3 = document.querySelector('h3.font-semibold');
      const adds = document.querySelector('.text-green-700, .dark\\:text-green-400');
      return {
        fund: h3?.textContent?.trim() ?? '',
        hasAdditions: Boolean(adds),
      };
    });
    log('Results have fund cards', Boolean(sample.fund), sample.fund);
  }

  if (outcome === 'error') {
    const err = afterSelect.bodyText.match(/Could not load[^\n]*/)?.[0] ?? 'unknown';
    log('Error message', false, err);
  }

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\nScreenshots saved to', OUT_DIR);
  console.log('Console/page errors:', report.errors.length ? report.errors.join('\n') : 'none');

  if (outcome !== 'results' && outcome !== 'empty') {
    if (outcome === 'loading') {
      log('Production still stuck on loading', false, 'Deploy the latest HoldingsCompare fix');
    } else {
      log('Compare did not finish', false, `outcome=${outcome}`);
    }
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
