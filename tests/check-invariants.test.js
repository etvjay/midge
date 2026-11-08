// Plan 09-1, Task 3: the invariant checker, exercised on small fixture repositories.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkInvariants } from '../scripts/check-invariants.js';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-'));
  const base = { 'foundry/invariants.json': JSON.stringify({ invariants: [], families: {} }), 'contracts/c/tests/t.rs': 'fn real_test() {}\n' };
  for (const [p, c] of Object.entries({ ...base, ...files })) { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), typeof c === 'string' ? c : JSON.stringify(c)); }
  return root;
}
const inv = (list, families = {}) => ({ 'foundry/invariants.json': { invariants: list, families } });
const good = { id: 'C-01', statement: 's', plain: 'p', kind: 'safety', status: 'holds', checks: [{ type: 'rust', ref: 'real_test' }] };

test('a clean fixture has no errors', () => { assert.deepEqual(checkInvariants({ root: fixture(inv([good])) }).errors, []); });

test('an id cited in a doc but defined nowhere is an error naming the id and the file', () => {
  const r = checkInvariants({ root: fixture({ ...inv([good]), 'docs/x.md': 'this relies on C-99.' }) });
  assert.ok(r.errors.some((e) => e.includes('C-99') && e.includes('docs/x.md')), JSON.stringify(r.errors));
});

test('a rust check whose test does not exist is an error', () => {
  const r = checkInvariants({ root: fixture(inv([{ ...good, checks: [{ type: 'rust', ref: 'renamed_away' }] }])) });
  assert.ok(r.errors.some((e) => e.includes('C-01') && e.includes('renamed_away')));
});

test('a node check must point at a file that contains the test name', () => {
  const ok = checkInvariants({ root: fixture({ ...inv([{ ...good, checks: [{ type: 'node', ref: 'tests/a.test.js::does the thing' }] }]), 'tests/a.test.js': "test('does the thing', () => {})" }) });
  assert.deepEqual(ok.errors, []);
  const bad = checkInvariants({ root: fixture({ ...inv([{ ...good, checks: [{ type: 'node', ref: 'tests/a.test.js::missing' }] }]), 'tests/a.test.js': "test('other', () => {})" }) });
  assert.ok(bad.errors.some((e) => e.includes('missing')));
});

test('an invariant that holds but has no checks is an error', () => {
  assert.ok(checkInvariants({ root: fixture(inv([{ ...good, checks: [] }])) }).errors.some((e) => e.includes('C-01')));
});

test('a superseded invariant must name a defined replacement', () => {
  const sup = { id: 'I-07-B', statement: 's', plain: 'p', kind: 'safety', status: 'superseded', supersededBy: 'C-77', checks: [] };
  assert.ok(checkInvariants({ root: fixture(inv([good, sup])) }).errors.some((e) => e.includes('C-77')));
  assert.deepEqual(checkInvariants({ root: fixture(inv([good, { ...sup, supersededBy: 'C-01' }])) }).errors, []);
});

test('a bare phase id resolves through families and is only a warning', () => {
  const r = checkInvariants({ root: fixture({ ...inv([good], { 'I-07': ['C-01'] }), 'foundry/gaps.jsonl': '{"affected_invariants":["I-07"]}\n' }) });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes('I-07')));
});

test('a superseded invariant cited in a claim is an error', () => {
  const sup = { id: 'I-07-B', statement: 's', plain: 'p', kind: 'safety', status: 'superseded', supersededBy: 'C-01', checks: [] };
  const r = checkInvariants({ root: fixture({ ...inv([good, sup]), 'foundry/claims.jsonl': '{"id":"CLAIM-1","text":"relies on I-07-B"}\n' }) });
  assert.ok(r.errors.some((e) => e.includes('I-07-B') && e.includes('superseded')));
});

test('phase documents may define their own I-NN-X invariants', () => {
  const r = checkInvariants({ root: fixture({ ...inv([good]), 'foundry/phases/01-x.md': '- `I-01-A`: something.\n', 'docs/y.md': 'see I-01-A' }) });
  assert.deepEqual(r.errors, []);
});

test('plans and specs under docs/superpowers may mention ids as examples', () => {
  const r = checkInvariants({ root: fixture({ ...inv([good]), 'docs/superpowers/plans/p.md': 'for example C-99 is cited here' }) });
  assert.deepEqual(r.errors, []);
});

test('a public contract function with no row in STATE_MACHINE.md is an error', () => {
  const lib = 'impl FlyCoordinator {\n pub fn alpha(&self) {}\n pub fn beta(&self) {}\n}\n';
  const doc = '## Contract transitions\n| Function | Who |\n|---|---|\n| `alpha` | anyone |\n';
  const r = checkInvariants({ root: fixture({ ...inv([good]), 'contracts/fly-coordinator/src/lib.rs': lib, 'docs/STATE_MACHINE.md': doc }) });
  assert.ok(r.errors.some((e) => e.includes('beta') && e.includes('STATE_MACHINE.md')), JSON.stringify(r.errors));
  const full = checkInvariants({ root: fixture({ ...inv([good]), 'contracts/fly-coordinator/src/lib.rs': lib, 'docs/STATE_MACHINE.md': doc + '| `beta` | anyone |\n' }) });
  assert.deepEqual(full.errors, []);
});

test('a row for a function the contract no longer has is an error', () => {
  const lib = 'impl FlyCoordinator {\n pub fn alpha(&self) {}\n}\n';
  const doc = '## Contract transitions\n| `alpha` | a |\n| `gone` | a |\n';
  const r = checkInvariants({ root: fixture({ ...inv([good]), 'contracts/fly-coordinator/src/lib.rs': lib, 'docs/STATE_MACHINE.md': doc }) });
  assert.ok(r.errors.some((e) => e.includes('gone')));
});
