import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, 'articles.json');

// Read existing file (it may be missing the closing bracket)
let raw = readFileSync(filePath, 'utf8').trim();
// Fix if missing closing bracket
if (!raw.endsWith(']')) {
  raw = raw + '\n]';
}

const existing = JSON.parse(raw);
console.log(`Existing articles: ${existing.length}`);

const newArticles = [
