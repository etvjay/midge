// The observed baseline of the NEAR AI host's measurements (GAP-043). It is what was seen on a day, not a statement that the build is trusted:
// the file must say so, must be well formed, and the live check must use it unless the owner switches it off.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadMeasurementBaseline } from '../src/enclave/attestation.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const FILE = path.join(root, 'docs/canonical/model-measurements.json');
const tmp = (obj) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-')), 'b.json'); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
const hex48 = (b) => Buffer.alloc(48, b).toString('hex');

test('the baseline file exists and loads into a pin for the five boot and runtime registers', () => {
  const b = loadMeasurementBaseline(FILE);
  assert.deepEqual(Object.keys(b.pin).sort(), ['mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3']);
  for (const values of Object.values(b.pin)) { assert.ok(values.length >= 1); for (const v of values) assert.match(v, /^[0-9a-f]{96}$/); }
});

test('it records which model, when it was read, how many times, and that it is only what was observed', () => {
  const b = loadMeasurementBaseline(FILE);
  assert.match(b.model, /\S/);
  assert.match(b.observedAt, /^2026-\d\d-\d\d/);
  assert.ok(b.runs >= 2, 'read more than once');
  assert.match(b.note, /observed/i);
  assert.match(b.note, /not (been )?(checked|verified)/i);
});

test('a baseline that is not an object of pins, or has a bad value, is refused', () => {
  assert.throws(() => loadMeasurementBaseline(tmp('not json')), /baseline/i);
  assert.throws(() => loadMeasurementBaseline(tmp({ model: 'm', observedAt: '2026-11-08', runs: 3, note: 'observed; not verified', measurements: { mrtd: ['zz'] } })), /baseline/i);
  assert.throws(() => loadMeasurementBaseline(tmp({ model: 'm', observedAt: '2026-11-08', runs: 3, note: 'observed; not verified', measurements: { nonsense: [hex48(1)] } })), /baseline/i);
});

test('a baseline that does not say it is only observed is refused', () => {
  assert.throws(() => loadMeasurementBaseline(tmp({ model: 'm', observedAt: '2026-11-08', runs: 3, note: 'trusted', measurements: { mrtd: [hex48(1)] } })), /observed|note/i);
});

test('the live model check pins to the baseline unless told not to', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/verify-roost-model.js'), 'utf8');
  assert.match(src, /model-measurements\.json/);
  assert.match(src, /--no-pin/);
  assert.match(src, /measure:model/, 'a mismatch tells the owner how to look at the new build');
});
