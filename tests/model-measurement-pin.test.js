// GAP-043, the operating side: the owner can switch the measurement pin on from the environment, and can read what the host reports now.
// Nothing is pinned by default; a malformed setting fails closed instead of being ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVerifiedModelKey, measurementPinFromEnv, readModelMeasurements, formatPinSuggestion } from '../src/enclave/attestation.js';

const key = 'ab'.repeat(32);
const hex48 = (b) => Buffer.alloc(48, b).toString('hex');
const M = { mrseam: hex48(0x11), mrtd: hex48(0x22), rtmr0: hex48(0x33), rtmr1: hex48(0x44), rtmr2: hex48(0x55), rtmr3: hex48(0x66) };
function quote(nonce, m) {
  const q = Buffer.alloc(700);
  q.writeUInt16LE(4, 0); q.writeUInt16LE(2, 2); q.writeUInt32LE(0x81, 4);
  for (const [k, [a]] of Object.entries({ mrseam: [64], mrtd: [184], rtmr0: [376], rtmr1: [424], rtmr2: [472], rtmr3: [520] })) Buffer.from(m[k], 'hex').copy(q, a);
  Buffer.from(key + nonce, 'hex').copy(q, 568);
  return q.toString('hex');
}
/** A fake attestation endpoint that echoes the caller's nonce; `measurementsFor(call)` says what the host reports on each call. */
function host(measurementsFor = () => M) {
  let calls = 0; const nonces = [];
  const fetchImpl = async (url) => {
    const nonce = new URL(url).searchParams.get('nonce'); nonces.push(nonce);
    const m = measurementsFor(calls++);
    return { ok: true, status: 200, json: async () => ({ model_attestations: [{ signing_algo: 'ed25519', model_name: 'm', request_nonce: nonce, signing_public_key: key, intel_quote: quote(nonce, m) }] }) };
  };
  return { fetchImpl, nonces, get calls() { return calls; } };
}
const withEnv = async (value, fn) => { const old = process.env.MIDGE_MODEL_MEASUREMENTS; if (value === undefined) delete process.env.MIDGE_MODEL_MEASUREMENTS; else process.env.MIDGE_MODEL_MEASUREMENTS = value; try { return await fn(); } finally { if (old === undefined) delete process.env.MIDGE_MODEL_MEASUREMENTS; else process.env.MIDGE_MODEL_MEASUREMENTS = old; } };

test('nothing is pinned unless the owner sets it', () => {
  assert.equal(measurementPinFromEnv({}), null);
  assert.equal(measurementPinFromEnv({ MIDGE_MODEL_MEASUREMENTS: '' }), null);
  assert.equal(measurementPinFromEnv({ MIDGE_MODEL_MEASUREMENTS: '   ' }), null);
});

test('a valid setting is read, with values lower-cased', () => {
  const pin = measurementPinFromEnv({ MIDGE_MODEL_MEASUREMENTS: JSON.stringify({ mrtd: [M.mrtd.toUpperCase()], rtmr3: [M.rtmr3, hex48(0x77)] }) });
  assert.deepEqual(pin, { mrtd: [M.mrtd], rtmr3: [M.rtmr3, hex48(0x77)] });
});

test('a setting that is not JSON, or is malformed, fails and names the variable', () => {
  assert.throws(() => measurementPinFromEnv({ MIDGE_MODEL_MEASUREMENTS: 'not json' }), /MIDGE_MODEL_MEASUREMENTS/);
  assert.throws(() => measurementPinFromEnv({ MIDGE_MODEL_MEASUREMENTS: '{"mrtd":["zz"]}' }), /MIDGE_MODEL_MEASUREMENTS/);
  assert.throws(() => measurementPinFromEnv({ MIDGE_MODEL_MEASUREMENTS: '{"nonsense":["' + M.mrtd + '"]}' }), /MIDGE_MODEL_MEASUREMENTS/);
});

test('the fetch uses the environment pin by default: a host that does not match is refused, naming the field', async () => {
  const pin = JSON.stringify({ mrtd: [hex48(0x99)] });
  await withEnv(pin, async () => {
    await assert.rejects(() => fetchVerifiedModelKey({ model: 'm', chain: 'skip', fetchImpl: host().fetchImpl }), /mrtd/);
  });
});

test('the fetch accepts a host that matches the environment pin and reports it as pinned', async () => {
  await withEnv(JSON.stringify({ mrtd: [M.mrtd], rtmr0: [M.rtmr0] }), async () => {
    const r = await fetchVerifiedModelKey({ model: 'm', chain: 'skip', fetchImpl: host().fetchImpl });
    assert.equal(r.measurementsPinned, true);
    assert.equal(r.publicKey, key);
  });
});

test('with no pin set the fetch still works and says nothing was pinned', async () => {
  await withEnv(undefined, async () => {
    const r = await fetchVerifiedModelKey({ model: 'm', chain: 'skip', fetchImpl: host().fetchImpl });
    assert.equal(r.measurementsPinned, false);
  });
});

test('an explicit pin in the call wins over the environment, and null switches it off', async () => {
  await withEnv(JSON.stringify({ mrtd: [hex48(0x99)] }), async () => {
    const ok = await fetchVerifiedModelKey({ model: 'm', chain: 'skip', fetchImpl: host().fetchImpl, expectedMeasurements: { mrtd: [M.mrtd] } });
    assert.equal(ok.measurementsPinned, true);
    const off = await fetchVerifiedModelKey({ model: 'm', chain: 'skip', fetchImpl: host().fetchImpl, expectedMeasurements: null });
    assert.equal(off.measurementsPinned, false);
  });
});

test('a malformed environment setting stops the fetch instead of being ignored', async () => {
  await withEnv('{oops', async () => {
    await assert.rejects(() => fetchVerifiedModelKey({ model: 'm', chain: 'skip', fetchImpl: host().fetchImpl }), /MIDGE_MODEL_MEASUREMENTS/);
  });
});

test('reading the host: reports each measurement, with a fresh nonce on every run, and says they were stable', async () => {
  const h = host();
  const r = await readModelMeasurements({ model: 'm', runs: 3, chain: 'skip', fetchImpl: h.fetchImpl });
  assert.deepEqual(r.measurements, M);
  assert.equal(r.stable, true);
  assert.deepEqual(r.differing, []);
  assert.equal(r.runs, 3);
  assert.equal(new Set(h.nonces).size, 3, 'a fresh nonce each time');
});

test('reading the host: measurements that change between runs are reported as unstable and named', async () => {
  const h = host((call) => (call === 0 ? M : { ...M, rtmr3: hex48(0x01) }));
  const r = await readModelMeasurements({ model: 'm', runs: 2, chain: 'skip', fetchImpl: h.fetchImpl });
  assert.equal(r.stable, false);
  assert.deepEqual(r.differing, ['rtmr3']);
});

test('the suggestion is a ready-to-use setting with a plain warning that the values are only what was observed', async () => {
  const r = await readModelMeasurements({ model: 'm', runs: 2, chain: 'skip', fetchImpl: host().fetchImpl });
  const text = formatPinSuggestion(r);
  const line = text.split('\n').find((l) => l.startsWith('MIDGE_MODEL_MEASUREMENTS='));
  assert.ok(line, 'a setting line');
  const parsed = measurementPinFromEnv({ MIDGE_MODEL_MEASUREMENTS: line.slice('MIDGE_MODEL_MEASUREMENTS='.length).replace(/^'|'$/g, '') });
  assert.deepEqual(parsed.mrtd, [M.mrtd]);
  assert.match(text, /observed/i);
  assert.match(text, /not (been )?(checked|verified)/i);
});

test('the suggestion refuses to suggest a pin for values that were not stable', async () => {
  const r = await readModelMeasurements({ model: 'm', runs: 2, chain: 'skip', fetchImpl: host((c) => (c === 0 ? M : { ...M, rtmr0: hex48(0x01) })).fetchImpl });
  const text = formatPinSuggestion(r);
  assert.doesNotMatch(text, /^MIDGE_MODEL_MEASUREMENTS=/m);
  assert.match(text, /rtmr0/);
});
