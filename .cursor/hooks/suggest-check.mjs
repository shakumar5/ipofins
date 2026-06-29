#!/usr/bin/env node
/** stop hook: suggest npm run check after src/ or db/ edits in session */
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

const touched = JSON.stringify(payload);
const interesting = /src\/(pages|components|lib)\//.test(touched) || /db\//.test(touched) || /\.astro/.test(touched) || /\.tsx/.test(touched);
if (!interesting) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  followupMessage: 'If you changed Astro/TS or DB types, run `npm run check` before committing.',
}));
