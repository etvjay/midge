// Diagnosed 2026-11-08: the "deterministic, no external keys" suite failed whenever cloud-api.near.ai answered anything but 200,
// because the OTC/compute check and the inference preflight had no recorded-fixture fallback (verification 01 does).
// Regression: with the endpoint forced to 503, both checks must still pass, and must say they used the recorded fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const preload = new URL('./helpers/force-503.mjs', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, ['--import', preload, ...args], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, NEARAI_API_KEY: 'decoy-key-for-test', NEAR_AI_API_KEY: '' }, timeout: 120000 });

test('the OTC and compute verification passes offline and says it used the recorded fixture', () => {
  const r = run(['verifications/06-otc-and-compute-facilities.js']);
  assert.equal(r.status, 0, r.stdout.slice(-400) + r.stderr.slice(-400));
  assert.match(r.stdout + r.stderr, /recorded fixture/i);
});

test('the inference attestation check does not fail when the endpoint is down: it skips, and says it did not demonstrate', () => {
  const r = run(['-e', "import('./scripts/verify-inference.js').then(m=>m.verifyInferenceAttestation({ live: true })).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"]);
  assert.equal(r.status, 0, r.stdout.slice(-400) + r.stderr.slice(-400));
  assert.match(r.stdout + r.stderr, /SKIP/);
  assert.doesNotMatch(r.stdout + r.stderr, /recorded fixture/i, 'no fixture is used for the inference check');
});
