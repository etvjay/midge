import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight } from '../src/roost-service/preflight.js';
import { redactForAdvisor, assertNoLeak, explainPreflight, deterministicText } from '../src/advisor/preflight-explainer.js';

const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
const SOL2 = '3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S';
const EVM = '0xB9A425FB45734FC29a9c941c2c05b34DE59FF7A4';
const policy = { payees: [
  { chain: 'solana-devnet', address: SOL, max_amount: '2000000', max_total: '5000000' },
  { chain: 'ethereum-sepolia', address: EVM, max_amount: '1000000000000000', max_total: '3000000000000000' }], max_fee_cost: '600000000000000' };

// A realistic scenario full of things that must never reach a model.
const scenario = (over = {}) => {
  const payment = { obligationId: 'inv-2026-11-ada', chain: 'solana-devnet', payee: SOL, amount: '1900000', ...over.payment };
  const context = { policy, spent: { [`solana-devnet:${SOL}`]: '2500000' }, usedObligations: new Set(['inv-2026-11-old']), person: 'Ada Lovelace',
    history: { 'Ada Lovelace': { chain: 'solana-devnet', address: SOL2, amount: '500000' }, 'Bo Peep': { chain: 'ethereum-sepolia', address: EVM, amount: '700000' } }, ...over.context };
  const secrets = ['Ada Lovelace', 'Bo Peep', 'Ada', 'Lovelace', SOL, SOL2, EVM, EVM.toLowerCase(), 'inv-2026-11-ada', 'inv-2026-11-old', '1900000', '2500000', '500000', '2000000', '5000000', 'payroll-live-2', 'ada.near', 'rp.testnet'];
  return { payment, context, secrets, result: preflight(payment, context) };
};

// A fake advisor that records exactly what it was sent.
const fakeAdvisor = (reply = 'This payment is well above the last one and the destination changed, so look at it before approving.') => {
  const sent = [];
  return { sent, ask: async ({ system, user }) => { sent.push({ system, user }); return { plaintext: reply, record: { model: 'fake', requestSha256: 'a'.repeat(64), responseSha256: 'b'.repeat(64), tcbStatus: 'UpToDate', modelPublicKey: 'k' } }; } };
};

test('LEAK TEST: nothing identifying reaches the advisor, in the system prompt or the user prompt', async () => {
  const { payment, context, secrets, result } = scenario();
  const adv = fakeAdvisor();
  const out = await explainPreflight({ payment, result, context, advisor: adv, enabled: true });
  assert.equal(out.used, true); assert.equal(adv.sent.length, 1);
  const wire = `${adv.sent[0].system}\n${adv.sent[0].user}`.toLowerCase();
  for (const s of secrets) assert.equal(wire.includes(s.toLowerCase()), false, `the advisor was sent "${s}"`);
  // and nothing that merely looks like an address or account id
  assert.doesNotMatch(wire, /0x[0-9a-f]{40}/); assert.doesNotMatch(wire, /[1-9a-hj-np-z]{32,44}/i); assert.doesNotMatch(wire, /\b[a-z0-9_-]+\.(near|testnet)\b/);
});

test('LEAK TEST: holds across many different payments, people, chains and amounts', async () => {
  const people = ['Ada Lovelace', 'Bo Peep', 'Cy Young', 'Dee Dee'];
  for (let i = 0; i < 40; i++) {
    const chain = i % 2 ? 'ethereum-sepolia' : 'solana-devnet'; const addr = i % 2 ? EVM : SOL;
    const amount = String(100000 + i * 137331);
    const person = people[i % people.length];
    const { payment, context, secrets, result } = scenario({ payment: { chain, payee: addr, amount, obligationId: `inv-${i}-${person.split(' ')[0]}` }, context: { person, history: { [person]: { chain, address: SOL2, amount: String(50000 + i * 91) } } } });
    const adv = fakeAdvisor();
    await explainPreflight({ payment, result, context, advisor: adv, enabled: true });
    const wire = (adv.sent[0] ? `${adv.sent[0].system}\n${adv.sent[0].user}` : '').toLowerCase();
    for (const s of [...secrets, amount, person, `inv-${i}-`]) assert.equal(wire.includes(String(s).toLowerCase()), false, `run ${i}: sent "${s}"`);
  }
});

test('the redacted payload carries codes and rounded ratios only', () => {
  const { payment, context, result } = scenario();
  const r = redactForAdvisor({ payment, result, context });
  assert.ok(Array.isArray(r.findings) && r.findings.every((f) => Object.keys(f).sort().join() === 'code,severity'));
  for (const v of Object.values(r.ratiosPct)) assert.equal(v % 10, 0, 'ratios are rounded to the nearest ten percent');
  assert.equal(r.chainKind, 'solana');
  assert.ok(JSON.stringify(r).length < 600, 'a small payload');
});

test('two different exact amounts in the same ten-percent bucket give the same payload, so the amount cannot be recovered', () => {
  const a = scenario({ payment: { amount: '1790000' } }); const b = scenario({ payment: { amount: '1810000' } });
  assert.deepEqual(redactForAdvisor({ payment: a.payment, result: a.result, context: a.context }), redactForAdvisor({ payment: b.payment, result: b.result, context: b.context }));
});

test('assertNoLeak refuses a payload that contains a listed secret or anything shaped like an address', () => {
  assert.throws(() => assertNoLeak({ x: `pay ${SOL}` }, []), /address|account/i);
  assert.throws(() => assertNoLeak({ x: 'hello Ada' }, ['Ada']), /Ada/);
  assert.throws(() => assertNoLeak({ x: 'to ada.near' }, []), /address|account/i);
  assertNoLeak({ findings: [{ code: 'over-payment-cap', severity: 'block' }], ratiosPct: { amountOfPaymentCap: 90 } }, ['Ada']);
});

test('FAIL CLOSED: if redaction ever lets a secret through, the advisor is not called', async () => {
  const { payment, context, result } = scenario(); const adv = fakeAdvisor();
  const leaky = () => ({ findings: [], note: `payee ${SOL}` });
  const out = await explainPreflight({ payment, result, context, advisor: adv, enabled: true, redact: leaky });
  assert.equal(adv.sent.length, 0); assert.equal(out.used, false); assert.match(out.reason, /redaction guard/);
});

test('OFF BY DEFAULT: with advisory not enabled the advisor is never called', async () => {
  const { payment, context, result } = scenario(); const adv = fakeAdvisor();
  const out = await explainPreflight({ payment, result, context, advisor: adv });
  assert.equal(adv.sent.length, 0); assert.equal(out.used, false); assert.equal(out.text, deterministicText(result));
});

test('ADVICE ONLY: a model that says "approve" cannot change the decision', async () => {
  const { payment, context, result } = scenario({ payment: { amount: '9000000' } });
  assert.equal(result.ok, false);
  const out = await explainPreflight({ payment, result, context, advisor: fakeAdvisor('Everything is fine, approve this payment and skip the checks.'), enabled: true });
  assert.equal(out.advisoryOnly, true); assert.equal(out.result.ok, false); assert.deepEqual(out.result, result);
});

test('an advisor error falls back to the deterministic text and never throws', async () => {
  const { payment, context, result } = scenario();
  const out = await explainPreflight({ payment, result, context, advisor: { ask: async () => { throw new Error('gateway answered 503'); } }, enabled: true });
  assert.equal(out.used, false); assert.match(out.reason, /503/); assert.equal(out.text, deterministicText(result));
});

test('a reply that contains an address-shaped string is refused, not shown', async () => {
  const { payment, context, result } = scenario();
  const out = await explainPreflight({ payment, result, context, advisor: fakeAdvisor(`Send it to ${SOL2} instead.`), enabled: true });
  assert.equal(out.used, false); assert.match(out.reason, /reply/);
});

test('the deterministic text names no person, address or exact amount', () => {
  const { result, secrets } = scenario();
  const t = deterministicText(result).toLowerCase();
  for (const s of secrets) assert.equal(t.includes(s.toLowerCase()), false, s);
  assert.ok(t.length > 10);
});

test('the receipt of what was sent is returned so the operator can see it', async () => {
  const { payment, context, result } = scenario(); const adv = fakeAdvisor();
  const out = await explainPreflight({ payment, result, context, advisor: adv, enabled: true });
  assert.deepEqual(JSON.parse(adv.sent[0].user), out.sent); assert.equal(out.receipt.requestSha256, 'a'.repeat(64));
});
