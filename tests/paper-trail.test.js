// The paper trail demo runs the real room code end to end and checks that the private lines add up to the public transfers.
// If it stops passing, the README section that shows it is no longer true.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const run = spawnSync('node', ['scripts/paper-trail.js'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', timeout: 60000 });

test('the paper trail demo exits 0 and every check in it passes', () => {
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /All checks passed\./);
  assert.equal((run.stdout.match(/✗/g) || []).length, 0);
});

test('it shows the refusal, the sub-transaction sums, the receipts and the auditor pack', () => {
  for (const re of [/room refuses the whole run/, /tax lines add up to the one tax transfer/, /benefits lines add up to the one benefits transfer/, /every transfer together equals the employer's charge/, /receipt with the net raised to 0\.05 fails verification/, /pack holds Bo's line and no other/, /totals-only view for an accountant carries no name or address/]) assert.match(run.stdout, re);
});

test('it labels itself as a local room with a simulated attestation and points to the hardware run', () => {
  assert.match(run.stdout, /simulated attestation/);
  assert.match(run.stdout, /20261112T031407Z-8c64/);
});
