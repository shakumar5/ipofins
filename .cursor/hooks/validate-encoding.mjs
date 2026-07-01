#!/usr/bin/env node
/**
 * afterFileEdit: auto-repair UTF-16 source files to UTF-8.
 */
import {
  isTextSourcePath,
  repairFileToUtf8,
  inspectFileEncoding,
} from '../../scripts/lib/source-encoding.mjs';

let input = '';
try {
  for await (const chunk of process.stdin) input += chunk;
} catch {
  input = '';
}

let payload = {};
try {
  payload = input ? JSON.parse(input) : {};
} catch {
  payload = {};
}

const filePath = payload.filePath || payload.path || payload.file || '';
if (!filePath || !isTextSourcePath(filePath)) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

let info;
try {
  info = inspectFileEncoding(filePath);
} catch {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

if (!info.broken) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

try {
  const result = repairFileToUtf8(filePath);
  if (result.repaired) {
    process.stdout.write(
      JSON.stringify({
        userMessage: `Repaired ${filePath} from ${result.encoding} to UTF-8 (required for Astro/TypeScript).`,
      }),
    );
  } else {
    process.stdout.write(JSON.stringify({}));
  }
} catch (err) {
  process.stdout.write(
    JSON.stringify({
      userMessage: `Could not repair encoding for ${filePath}: ${err.message}`,
    }),
  );
}