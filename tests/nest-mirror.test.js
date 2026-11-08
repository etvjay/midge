// Plan 09-1, Task 11 (hole H5): src/contracts/nest.js simulates the contract; its status names must not drift from the contract's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { statusDrift, STATUS_MAP } from '../scripts/status-drift.js';

const lib = fs.readFileSync(new URL('../contracts/fly-coordinator/src/lib.rs', import.meta.url), 'utf8');
const nest = fs.readFileSync(new URL('../src/contracts/nest.js', import.meta.url), 'utf8');

test('the real contract and its JavaScript simulation agree on every status', () => {
  assert.deepEqual(statusDrift(lib, nest), []);
  assert.deepEqual(STATUS_MAP, { Active: 'ACTIVE', Settled: 'SETTLED', AbortedRefunded: 'ABORTED_REFUNDED' });
});

test('a status added to the contract only is reported', () => {
  const grown = lib.replace('pub enum SyndicateStatus {\n    Active,', 'pub enum SyndicateStatus {\n    Active,\n    Frozen,');
  assert.notEqual(grown, lib);
  const drift = statusDrift(grown, nest);
  assert.ok(drift.some((d) => d.includes('Frozen')), JSON.stringify(drift));
});

test('a status the simulation uses but the contract does not have is reported', () => {
  const grown = nest + "\nsyn.status = 'ON_HOLD';\n";
  assert.ok(statusDrift(lib, grown).some((d) => d.includes('ON_HOLD')));
});
