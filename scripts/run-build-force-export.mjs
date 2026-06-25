#!/usr/bin/env node
/** Run npm run build with FORCE_EXPORT=1 (fresh Neon → public/data). */
import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_EXPORT: '1' },
});

process.exit(result.status ?? 1);
