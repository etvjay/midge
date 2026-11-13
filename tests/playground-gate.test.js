import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewGate } from '../src/playground/review-gate.js';

const LINES = [
  { person: 'Alice', payee: 'a.testnet', gross: '0.05', tax: '0.0075', benefits: '0.0025', payeeKey: 'aa' },
  { person: 'Bo', payee: 'b.testnet', gross: '0.04', tax: '0.006', benefits: '0.002', payeeKey: 'bb' },
];
const GOOD = { used: true, findings: [{ line: 'A', code: 'zero-deduction', check: 'verified' }], receipt: { model: 'm' } };
const mk = () => { const c = { t: 1_800_000_000_000 }; return { c, gate: createReviewGate({ now: () => c.t }) }; };

test('the gate is closed until a successful review of exactly these lines', () => {
  const { gate } = mk();
  assert.equal(gate.allow({ session: 's1', lines: LINES }).ok, false);
  gate.reserve({ session: 's1' }); gate.record({ session: 's1', lines: LINES, result: GOOD });
  const a = gate.allow({ session: 's1', lines: LINES });
  assert.equal(a.ok, true); assert.deepEqual(a.review, GOOD);
});

test('editing any gross, tax or benefits value, or a name, closes the gate with a plain reason', () => {
  const { gate } = mk();
  gate.reserve({ session: 's1' }); gate.record({ session: 's1', lines: LINES, result: GOOD });
  for (const edit of [{ gross: '0.051' }, { tax: '0' }, { benefits: '0.003' }, { person: 'Alicia' }]) {
    const changed = [{ ...LINES[0], ...edit }, LINES[1]];
    const r = gate.allow({ session: 's1', lines: changed });
    assert.equal(r.ok, false, JSON.stringify(edit)); assert.match(r.reason, /review/i);
  }
});

test('the hash ignores addresses and key material, so account creation does not close the gate', () => {
  const { gate } = mk();
  gate.reserve({ session: 's1' }); gate.record({ session: 's1', lines: LINES, result: GOOD });
  const withOtherAddresses = LINES.map((l, i) => ({ ...l, payee: `other${i}.testnet`, payeeKey: 'ff' }));
  assert.equal(gate.allow({ session: 's1', lines: withOtherAddresses }).ok, true);
  assert.equal(gate.linesHash(LINES), gate.linesHash(withOtherAddresses));
});

test('a review that failed or was not used never opens the gate', () => {
  const { gate } = mk();
  gate.reserve({ session: 's1' });
  assert.throws(() => gate.record({ session: 's1', lines: LINES, result: { used: false, reason: 'the model did not answer' } }), /not a review/i);
  assert.equal(gate.allow({ session: 's1', lines: LINES }).ok, false);
});

test('a review in one session does not open the gate for another session', () => {
  const { gate } = mk();
  gate.reserve({ session: 's1' }); gate.record({ session: 's1', lines: LINES, result: GOOD });
  assert.equal(gate.allow({ session: 's2', lines: LINES }).ok, false);
});

test('the seventh review in a session is refused, even if earlier ones failed, because each one costs a model call', () => {
  const { gate } = mk();
  for (let i = 0; i < 6; i += 1) gate.reserve({ session: 's1' });
  assert.throws(() => gate.reserve({ session: 's1' }), /6 reviews/);
  gate.reserve({ session: 's2' });
});

test('the 61st review in an hour is refused, and the hour moves on', () => {
  const { gate, c } = mk();
  for (let i = 0; i < 60; i += 1) gate.reserve({ session: `s${i}` });
  assert.throws(() => gate.reserve({ session: 'late' }), /hour/);
  c.t += 61 * 60 * 1000;
  gate.reserve({ session: 'late' });
});
