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

test('every Roost round method has a row', () => {
  const rows = rowNames(part('## The Roost round'));
  for (const m of ['openRound', 'submitSignedIntent', 'submitSealedIntent', 'exclude', 'runAuction', 'runPool', 'runQuote', 'runBallot', 'runRfq', 'runPayrun', 'runCross', 'signSettlement']) assert.ok(rows.includes(m), `no row for ${m}`);
});
