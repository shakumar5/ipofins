#!/usr/bin/env node
/**
 * Wait for an in-flight NSE pipeline terminal log to finish, then run BSE-only + compute + check.
 * Usage: node scripts/node-with-ca.mjs scripts/watch-and-run-bse-pipeline.mjs [terminal-log-path]
 */

import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const logPath =
  process.argv[2]
  || 'C:\\Users\\shaik\\.cursor\\projects\\c-Users-shaik-Downloads-Testing-Finverse\\terminals\\301395.txt';

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}] ${msg}`);
}

function tailProgress() {
  if (!existsSync(logPath)) return null;
  const text = readFileSync(logPath, 'utf8');
  const done = /✅ Pipeline 4 complete|exit_code:\s*0/.test(text);
  const failed = /exit_code:\s*(?!0)/.test(text.split('---').pop() || '');
  const m = [...text.matchAll(/(\d+)\/2655 stocks processed/g)].pop();
  return { done, failed, progress: m ? m[1] : null };
}

function runNpm(script) {
  return new Promise((resolve, reject) => {
    log(`Starting: npm run ${script}`);
    const child = spawn('npm', ['run', script], {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function waitForNsePipeline() {
  log(`Watching NSE pipeline log: ${logPath}`);
  let lastProgress = '';
  while (true) {
    const state = tailProgress();
    if (!state) {
      log('Log file not found — assuming NSE pipeline already finished');
      return;
    }
    if (state.failed) {
      log('NSE pipeline appears to have failed — starting BSE-only pass anyway');
      return;
    }
    if (state.done) {
      log('NSE pipeline complete');
      return;
    }
    if (state.progress && state.progress !== lastProgress) {
      lastProgress = state.progress;
      log(`NSE progress: ${state.progress}/2655`);
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
}

async function main() {
  await waitForNsePipeline();
  await runNpm('pipeline:superinvestor:bse');
  await runNpm('db:compute-si');
  await runNpm('db:check-si');
  log('All done — NSE + BSE-only pipeline, compute, and QA check finished');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
