import { platform } from 'node:os';

/** Windows needs --use-system-ca for Neon TLS; Linux/macOS CI does not support it. */
export function nodeExtraArgs() {
  return platform() === 'win32' ? ['--use-system-ca'] : [];
}

/** Build a shell command: node [--use-system-ca] script.mjs [args] */
export function nodeExecCmd(scriptPath, extraArgs = '') {
  const prefix = nodeExtraArgs().length ? 'node --use-system-ca ' : 'node ';
  return `${prefix}${scriptPath}${extraArgs ? ` ${extraArgs}` : ''}`;
}
