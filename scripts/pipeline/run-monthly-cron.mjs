#!/usr/bin/env node
/**
 * Monthly cron — MF holdings + SAST sweep + SAST JSON export.
 * 15th of each month, 6 AM IST via GitHub Actions (pipeline-monthly.yml).
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nodeExtraArgs } from '../lib/node-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FULL = process.argv.includes('--full');

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
  console.log('  Monthly cron — MF Holdings + SAST');
  console.log(`  Holdings: ${FULL ? 'full reload' : 'incremental'}`);
  console.log(`  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log('\n  [1/3] MF holdings...');
  await runPipeline('03-monthly-mf-holdings.mjs', FULL ? ['--full'] : []);
  console.log('\n  [2/3] SAST sweep (31-day lookback)...');
  await runNpmScript('pipeline:sast-sweep', ['--', '--days=31']);
  console.log('\n  [3/3] SAST JSON export...');
  await runNpmScript('export:sast-updates');
  console.log(`\n  Monthly cron complete in ${((Date.now() - totalStart) / 1000).toFixed(1)}s\n`);
}

main().catch((err) => {
  console.error('\n  Monthly cron failed:', err.message);
  process.exit(1);
});
