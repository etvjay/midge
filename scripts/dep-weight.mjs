#!/usr/bin/env node
// Measures the installed size of the production dependencies (the ones the playground image ships) and fails when any package, or the total, grows past the
// value recorded in scripts/dep-weight.baseline.json. Run `node scripts/dep-weight.mjs --update` to record new values after a deliberate change.
// Needs `npm ci` to have run. Dev-only packages are not counted.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const baselineFile = path.join(root, 'scripts/dep-weight.baseline.json');

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.name === 'node_modules') continue; // nested packages are counted under their own path
    if (entry.isDirectory()) total += dirSize(p);
    else if (entry.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

export function measure(base = root) {
  const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json'), 'utf8')).packages;
  const sizes = {};
  for (const [key, meta] of Object.entries(lock)) {
    if (!key || meta.dev || meta.devOptional || meta.optional) continue;
    const dir = path.join(base, key);
    if (!fs.existsSync(dir)) continue;
    sizes[key.replace(/^node_modules\//, '')] = dirSize(dir);
  }
  return { total: Object.values(sizes).reduce((a, b) => a + b, 0), packages: sizes };
}

export function compare(current, baseline) {
  const problems = [];
  if (current.total > baseline.total) problems.push(`total grew from ${baseline.total} to ${current.total} bytes`);
  for (const [name, size] of Object.entries(current.packages)) {
    const before = baseline.packages[name];
    if (before === undefined) problems.push(`new production package ${name} (${size} bytes)`);
    else if (size > before) problems.push(`${name} grew from ${before} to ${size} bytes`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const current = measure();
  if (process.argv.includes('--update')) {
    fs.writeFileSync(baselineFile, `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), ...current }, null, 1)}\n`);
    console.log(`recorded ${Object.keys(current.packages).length} packages, ${current.total} bytes`);
  } else {
    const problems = compare(current, JSON.parse(fs.readFileSync(baselineFile, 'utf8')));
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`production dependencies: ${Object.keys(current.packages).length} packages, ${current.total} bytes, no growth`);
  }
}
