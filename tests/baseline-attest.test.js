// A judge's live check must not fail only because NEAR AI shipped a new build. A host that is attested and verified but differs from the
// recorded baseline is reported as a warning and the check goes on; only an owner who asks for it (--require-pin, or their own
// MIDGE_MODEL_MEASUREMENTS) gets a hard failure. A measurement mismatch is the ONLY thing that is let through: any other failed check still stops.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attestAgainstBaseline } from '../src/enclave/attestation.js';

const hex48 = (b) => Buffer.alloc(48, b).toString('hex');
const baseline = { pin: { mrtd: [hex48(1)], rtmr0: [hex48(2)], rtmr1: [hex48(3)], rtmr2: [hex48(4)], rtmr3: [hex48(5)] }, observedAt: '2026-11-08', runs: 3 };
const MISMATCH = 'no model attestation candidate passed: measurement rtmr3 is one the owner pinned';
const OTHER = 'no model attestation candidate passed: Intel certificate chain verifies';
const BOTH = `no model attestation candidate passed: measurement rtmr3 is one the owner pinned; Intel certificate chain verifies`;

/** A fake attest() that behaves like the real one: it reads the pin from the environment at the moment it is called. */
function fake(env, { whenPinned = 'ok', whenUnpinned = 'ok' } = {}) {
  const calls = [];
  const attest = async () => {
    const pinned = Boolean(env.MIDGE_MODEL_MEASUREMENTS);
    calls.push(pinned);
    const outcome = pinned ? whenPinned : whenUnpinned;
    if (outcome !== 'ok') throw new Error(outcome);
    return { publicKey: 'k', pinned };
  };
  return { attest, calls };
}
const run = async (opts, behave) => {
  const env = opts.env ?? {}; const logs = []; const f = fake(env, behave);
  const result = await attestAgainstBaseline({ attest: f.attest, baseline, env, log: (m) => logs.push(m), ...opts, env }).catch((e) => ({ error: e.message }));
  return { result, logs, calls: f.calls, env };
};

test('a host that matches the baseline is accepted, pinned, with no warning', async () => {
  const { result, logs, calls } = await run({});
  assert.equal(result.mode, 'pinned');
  assert.deepEqual(calls, [true]);
  assert.ok(!logs.some((l) => /differs/i.test(l)));
});

test('a host that differs only in its measurements is accepted with a plain warning, and the check goes on unpinned', async () => {
  const { result, logs, calls, env } = await run({}, { whenPinned: MISMATCH });
  assert.equal(result.mode, 'differs');
  assert.deepEqual(calls, [true, false], 'tried pinned, then unpinned');
  assert.equal(env.MIDGE_MODEL_MEASUREMENTS, undefined, 'the pin is off for the rest of the run');
  const text = logs.join('\n');
  assert.match(text, /differs from the baseline observed 2026-11-08/);
  assert.match(text, /attested and verified/i);
  assert.match(text, /measure:model/);
});

test('a mismatch that comes with another failed check is not let through', async () => {
  const { result, calls } = await run({}, { whenPinned: BOTH });
  assert.match(result.error, /certificate chain/);
  assert.deepEqual(calls, [true], 'no retry');
});

test('any other failure is not let through', async () => {
  const { result, calls } = await run({}, { whenPinned: OTHER });
  assert.match(result.error, /certificate chain/);
  assert.deepEqual(calls, [true]);
});

test('a failure of the unpinned retry is not hidden', async () => {
  const { result } = await run({}, { whenPinned: MISMATCH, whenUnpinned: OTHER });
  assert.match(result.error, /certificate chain/);
});

test('--require-pin makes a mismatch a failure', async () => {
  const { result, calls } = await run({ requirePin: true }, { whenPinned: MISMATCH });
  assert.match(result.error, /measurement rtmr3/);
  assert.deepEqual(calls, [true]);
});

test('--no-pin attests once with nothing pinned', async () => {
  const { result, calls } = await run({ noPin: true });
  assert.equal(result.mode, 'unpinned');
  assert.deepEqual(calls, [false]);
});

test('a pin the owner set themselves is strict: a mismatch fails and is not retried', async () => {
  const { result, calls } = await run({ env: { MIDGE_MODEL_MEASUREMENTS: '{"mrtd":["x"]}' } }, { whenPinned: MISMATCH });
  assert.match(result.error, /measurement rtmr3/);
  assert.deepEqual(calls, [true]);
});

test('a pin the owner set themselves that matches is reported as the owner\'s', async () => {
  const { result } = await run({ env: { MIDGE_MODEL_MEASUREMENTS: '{"mrtd":["x"]}' } });
  assert.equal(result.mode, 'env');
});
