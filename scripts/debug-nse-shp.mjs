/** Debug NSE shareholding table rows */
import { existsSync } from 'fs';

const sym = process.argv[2] || 'TCS';
let puppeteer;
try { puppeteer = await import('puppeteer'); } catch { puppeteer = await import('puppeteer-core'); }
const chromePaths = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'];
const browser = await puppeteer.default.launch({ headless: 'new', executablePath: chromePaths.find((p)=>p&&existsSync(p)), args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');
await page.goto('https://www.nseindia.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
await new Promise((r) => setTimeout(r, 2500));
await page.goto(`https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${sym}`, { waitUntil: 'networkidle2', timeout: 90000 });
for (const wait of [3000, 5000, 8000]) {
  await new Promise((r) => setTimeout(r, wait));
  const n = await page.evaluate(() => {
    let max = 0;
    document.querySelectorAll('table').forEach((t) => { max = Math.max(max, t.querySelectorAll('td').length); });
    return max;
  });
  console.log(`after ${wait}ms: max td cells in any table = ${n}`);
}

const rows = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('table tr').forEach((tr) => {
    const tds = [...tr.querySelectorAll('td')];
    if (tds.length < 6) return;
    const cells = tds.map((c) => c.textContent.replace(/\s+/g, ' ').trim());
    out.push({ cols: cells.length, c0: cells[0]?.slice(0,40), c1: cells[1]?.slice(0,50), c6: cells[6], c7: cells[7], c8: cells[8] });
  });
  return out.filter((r) => r.c1 && !r.c1.includes('Category of shareholder')).slice(0, 30);
});
console.log(JSON.stringify(rows, null, 2));

await browser.close();
