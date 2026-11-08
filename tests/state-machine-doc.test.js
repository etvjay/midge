// Plan 09-1, Task 2: docs/STATE_MACHINE.md has a row for every public contract function and for each Roost round method,
// and names no function that does not exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contractPublicFns } from '../scripts/contract-api.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const doc = fs.existsSync(new URL('../docs/STATE_MACHINE.md', import.meta.url)) ? read('docs/STATE_MACHINE.md') : '';
const rowNames = (section) => [...section.matchAll(/^\|\s*`([a-zA-Z_][a-zA-Z0-9_]*)`\s*\|/gm)].map((m) => m[1]);
const part = (title) => { const i = doc.indexOf(title); if (i < 0) return ''; const j = doc.indexOf('\n## ', i + 1); return doc.slice(i, j < 0 ? undefined : j); };

test('every public contract function has a row, and no row names a missing function', () => {
  const fns = contractPublicFns(read('contracts/fly-coordinator/src/lib.rs'));
  const rows = rowNames(part('## Contract transitions'));
  assert.deepEqual(fns.filter((f) => !rows.includes(f)), [], 'functions with no row');
  assert.deepEqual(rows.filter((r) => !fns.includes(r)), [], 'rows for functions that do not exist');
});

test('every public HostedRoost method has a row, and no row names a method that does not exist', () => {
  const src = read('src/roost-service/hosted-roost.js');
  const body = src.slice(src.indexOf('export class HostedRoost'));
  const methods = [...new Set([...body.matchAll(/^  (?:async\s+)?(?:get\s+)?([a-zA-Z_][A-Za-z0-9_]*)\s*\(/gm)].map((m) => m[1]).filter((n) => !['constructor', 'if', 'for', 'while', 'switch', 'catch', 'return'].includes(n)))];
  const rows = rowNames(part('## The Roost round'));
  assert.deepEqual(methods.filter((m) => !rows.includes(m)), [], 'methods with no row');
  assert.deepEqual(rows.filter((r) => !methods.includes(r)), [], 'rows for methods that do not exist');
});
