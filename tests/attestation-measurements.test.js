// Audit lead 11: a verified quote proved only that SOME genuine TDX machine holds the key and nonce. Pinning the measurements
// (MRTD, RTMR0 to RTMR3) makes it the NEAR AI model host, or whatever stack the owner pinned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTdxQuote, checkModelCandidate, MEASUREMENT_FIELDS } from '../src/enclave/attestation.js';

const key = 'ab'.repeat(32); const nonce = 'cd'.repeat(32);
const hex48 = (b) => Buffer.alloc(48, b).toString('hex');
const M = { mrseam: hex48(0x11), mrtd: hex48(0x22), rtmr0: hex48(0x33), rtmr1: hex48(0x44), rtmr2: hex48(0x55), rtmr3: hex48(0x66) };
function quote(m = M) {
  const q = Buffer.alloc(700);
  q.writeUInt16LE(4, 0); q.writeUInt16LE(2, 2); q.writeUInt32LE(0x81, 4);
  Buffer.from(m.mrseam, 'hex').copy(q, 64); Buffer.from(m.mrtd, 'hex').copy(q, 184);
  Buffer.from(m.rtmr0, 'hex').copy(q, 376); Buffer.from(m.rtmr1, 'hex').copy(q, 424); Buffer.from(m.rtmr2, 'hex').copy(q, 472); Buffer.from(m.rtmr3, 'hex').copy(q, 520);
  Buffer.from(key + nonce, 'hex').copy(q, 568);
  return q.toString('hex');
}
const cand = (m) => ({ signing_algo: 'ed25519', model_name: 'm', request_nonce: nonce, signing_public_key: key, intel_quote: quote(m) });
const base = { nonce, model: 'm', chain: 'skip' };

test('the measurements are read from the offsets of the TDX quote body', () => {
  const p = parseTdxQuote(quote());
  assert.deepEqual(p.measurements, M);
  assert.deepEqual([...MEASUREMENT_FIELDS].sort(), ['mrseam', 'mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3']);
});

test('with no pin the candidate passes, the measurements are reported, and it says they are not pinned', () => {
  const r = checkModelCandidate(cand(), base);
  assert.equal(r.ok, true);
  assert.deepEqual(r.measurements, M);
  assert.equal(r.measurementsPinned, false);
});

test('with a matching pin the candidate passes and says they are pinned', () => {
  const r = checkModelCandidate(cand(), { ...base, expectedMeasurements: { mrtd: [M.mrtd], rtmr0: [M.rtmr0], rtmr1: [M.rtmr1], rtmr2: [M.rtmr2], rtmr3: [M.rtmr3] } });
  assert.equal(r.ok, true);
  assert.equal(r.measurementsPinned, true);
});

for (const f of ['mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3']) {
  test(`a quote whose ${f} differs from the pin is rejected, naming the field`, () => {
    const pin = Object.fromEntries(['mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3'].map((k) => [k, [M[k]]]));
    pin[f] = [hex48(0x99)];
    const r = checkModelCandidate(cand(), { ...base, expectedMeasurements: pin });
    assert.equal(r.ok, false);
    const bad = r.checks.find((c) => !c.ok && /measurement/i.test(c.name));
    assert.ok(bad, 'a failing measurement check');
    assert.match(bad.detail, new RegExp(f));
  });
}

test('only the pinned fields are compared', () => {
  const r = checkModelCandidate(cand({ ...M, rtmr0: hex48(0x77) }), { ...base, expectedMeasurements: { mrtd: [M.mrtd], rtmr3: [M.rtmr3] } });
  assert.equal(r.ok, true, 'rtmr0 is not pinned, so its difference is not an error');
});

test('a list of acceptable values lets an owner accept an old and a new build during a rotation', () => {
  const pin = { rtmr3: [hex48(0x01), M.rtmr3] };
  assert.equal(checkModelCandidate(cand(), { ...base, expectedMeasurements: pin }).ok, true);
  assert.equal(checkModelCandidate(cand({ ...M, rtmr3: hex48(0x02) }), { ...base, expectedMeasurements: pin }).ok, false);
});

test('a malformed pin throws instead of being ignored', () => {
  for (const bad of [{ mrtd: 'nothex' }, { mrtd: ['zz'] }, { mrtd: [] }, { nonsense: [M.mrtd] }, { mrtd: [M.mrtd.slice(2)] }, 'x']) {
    assert.throws(() => checkModelCandidate(cand(), { ...base, expectedMeasurements: bad }), /expectedMeasurements/, JSON.stringify(bad));
  }
});

test('comparison ignores case in the pin', () => {
  assert.equal(checkModelCandidate(cand(), { ...base, expectedMeasurements: { mrtd: [M.mrtd.toUpperCase()] } }).ok, true);
});

test('a quote too short to hold the measurements is rejected when a pin is given', () => {
  const short = { ...cand(), intel_quote: 'ab'.repeat(100) };
  assert.equal(checkModelCandidate(short, { ...base, expectedMeasurements: { mrtd: [M.mrtd] } }).ok, false);
});
