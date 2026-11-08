// Plan 09-1, Task 1: list the contract's public functions without being fooled by comments or strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contractPublicFns } from '../scripts/contract-api.js';

const lib = fs.readFileSync(new URL('../contracts/fly-coordinator/src/lib.rs', import.meta.url), 'utf8');

test('the real contract lists its public entry points and leaves out ReleasePolicy helpers', () => {
  const fns = contractPublicFns(lib);
  for (const f of ['hatch', 'deposit', 'settle_batch_charged', 'on_settlement_payout', 'recover_stuck_settlement', 'prune_syndicate']) assert.ok(fns.includes(f), `missing ${f}`);
  for (const f of ['compute_hash', 'is_deadline_passed', 'validate']) assert.ok(!fns.includes(f), `${f} belongs to ReleasePolicy`);
  assert.deepEqual(fns, [...new Set(fns)].sort());
});

test('a function named only in a comment or a string is not counted', () => {
  const src = `impl FlyCoordinator {\n  // pub fn ghost() {}\n  /* pub fn ghost2() {} */\n  pub fn real(&self) { let s = "pub fn phantom()"; }\n}\nimpl Other { pub fn elsewhere() {} }`;
  assert.deepEqual(contractPublicFns(src), ['real']);
});
