// Plan 09-1, Task 6: the checker itself is tested by breaking a copy of the real repository three ways.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkInvariants } from '../scripts/check-invariants.js';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
function copy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-real-'));
  for (const d of ['docs', 'foundry', 'contracts/fly-coordinator/src', 'contracts/fly-coordinator/tests', 'tests']) {
    if (fs.existsSync(path.join(repo, d))) fs.cpSync(path.join(repo, d), path.join(root, d), { recursive: true, filter: (s) => !s.includes('node_modules') });
  }
  return root;
}
const edit = (root, rel, fn) => { const p = path.join(root, rel); const before = fs.readFileSync(p, 'utf8'); const after = fn(before); assert.notEqual(after, before, `mutation did not change ${rel}`); fs.writeFileSync(p, after); };

test('the untouched repository has no invariant errors', () => {
  assert.deepEqual(checkInvariants({ root: copy() }).errors, []);
});

test('deleting a function row from STATE_MACHINE.md is caught', () => {
  const root = copy();
  edit(root, 'docs/STATE_MACHINE.md', (t) => t.split('\n').filter((l) => !l.startsWith('| `recover_stuck_settlement`')).join('\n'));
  assert.ok(checkInvariants({ root }).errors.some((e) => e.includes('recover_stuck_settlement')));
});

test('renaming a Rust test that an invariant names is caught', () => {
  const root = copy();
  edit(root, 'contracts/fly-coordinator/tests/unit_tests.rs', (t) => t.replace('fn test_bad_signature_fails', 'fn test_bad_signature_fails_renamed'));
  assert.ok(checkInvariants({ root }).errors.some((e) => e.includes('C-04') && e.includes('test_bad_signature_fails')));
});

test('citing an invariant that is not defined is caught', () => {
  const root = copy();
  edit(root, 'docs/STATE_MACHINE.md', (t) => t + '\nThis also relies on C-99.\n');
  assert.ok(checkInvariants({ root }).errors.some((e) => e.includes('C-99')));
});
