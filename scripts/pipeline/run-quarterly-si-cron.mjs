#!/usr/bin/env node
/**
 * Quarterly cron — Super Investors + 1% Club SHP + signals + export.
 * Scheduled 28 Jan/Apr/Jul/Oct 6 AM IST (after SEBI SHP window; see si-quarters.mjs).
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nodeExtraArgs } from '../lib/node-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extraPipelineArgs = process.argv.slice(2).filter((a) => a.startsWith('--'));

function runNpmScript(scriptName, npmExtraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', scriptName, ...npmExtraArgs], {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run ${scriptName} exited with code ${code}`));
    });
  });
}

function runPipeline(scriptName, pipelineArgs = []) {
  const script = join(__dirname, scriptName);
  return new Promise((resolve, reject) => {
    const args = [...nodeExtraArgs(), script, ...pipelineArgs];
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

async function main() {
  const totalStart = Date.now();
  console.log('');
  console.log('  Quarterly cron — Super Investors + 1% Club');
  console.log(`  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log('\n  [1/4] SHP fetch (Pipeline 4)...');
  await runPipeline('04-super-investor-holdings.mjs', ['--concurrency=40', ...extraPipelineArgs]);
  console.log('\n  [2/4] Entity values + QoQ signals...');
  await runNpmScript('db:compute-si');
  console.log('\n  [3/4] Refresh SI materialized views...');
  await runNpmScript('db:refresh-si-views');
  console.log('\n  [4/4] Export client JSON...');
  await runNpmScript('export:client-data');
  console.log(`\n  Quarterly SI cron complete in ${((Date.now() - totalStart) / 1000).toFixed(1)}s\n`);
}

main().catch((err) => {
  console.error('\n  Quarterly SI cron failed:', err.message);
  process.exit(1);
});
