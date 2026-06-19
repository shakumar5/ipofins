import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const f = 'C:/Users/shaik/Downloads/Holdings/quant_Monthly_Portfolio_May26.xlsx';
const wb = XLSX.readFile(f);
for (const sn of wb.SheetNames) {
  const d = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, sheetRows: 4 });
  const n = JSON.stringify(d[1] || []);
  if (/flexi|elss|large cap|mid cap|small cap/i.test(n)) console.log(sn, d[1]);
}
