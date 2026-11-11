import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight } from '../src/roost-service/preflight.js';

const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
const EVM = '0xB9A425FB45734FC29a9c941c2c05b34DE59FF7A4';
const policy = { payees: [
  { chain: 'solana-devnet', address: SOL, max_amount: '2000000', max_total: '5000000' },
  { chain: 'ethereum-sepolia', address: EVM, max_amount: '1000000000000000', max_total: '3000000000000000' }], max_fee_cost: '600000000000000' };
const pay = (o = {}) => ({ obligationId: 'o-1', chain: 'solana-devnet', payee: SOL, amount: '1000000', ...o });
const ctx = (o = {}) => ({ policy, spent: {}, usedObligations: new Set(), history: {}, ...o });
const codes = (r) => r.findings.map((f) => f.code);

test('an in-rules payment passes with no findings', () => { const r = preflight(pay(), ctx()); assert.equal(r.ok, true); assert.deepEqual(r.findings, []); });
test('an unlisted payee is blocked', () => { const r = preflight(pay({ payee: '3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S' }), ctx()); assert.equal(r.ok, false); assert.ok(codes(r).includes('payee-not-allowed')); });
test('the same address on the wrong chain is blocked', () => { const r = preflight(pay({ chain: 'ethereum-sepolia' }), ctx()); assert.equal(r.ok, false); assert.ok(codes(r).some((c) => c === 'bad-address' || c === 'payee-not-allowed')); });
test('an Ethereum address listed for Solana only is blocked as not allowed', () => { const r = preflight(pay({ chain: 'ethereum-sepolia', payee: '0x000000000000000000000000000000000000dEaD' }), ctx()); assert.ok(codes(r).includes('payee-not-allowed')); });
test('an amount over the per-payment cap is blocked', () => { assert.ok(codes(preflight(pay({ amount: '2000001' }), ctx())).includes('over-payment-cap')); });
test('a payment that passes the running total is blocked', () => { assert.ok(codes(preflight(pay({ amount: '1000000' }), ctx({ spent: { [`solana-devnet:${SOL}`]: '4500000' } }))).includes('over-running-total')); });
test('a reused obligation id is blocked', () => { assert.ok(codes(preflight(pay(), ctx({ usedObligations: new Set(['o-1']) }))).includes('duplicate-obligation')); });
test('a malformed address is blocked before anything else', () => { const r = preflight(pay({ payee: 'not-an-address' }), ctx()); assert.equal(r.ok, false); assert.ok(codes(r).includes('bad-address')); });
test('an Ethereum fee over the cap is blocked', () => { const r = preflight(pay({ chain: 'ethereum-sepolia', payee: EVM, amount: '1', gasLimit: 300000, maxFee: '3000000000' }), ctx()); assert.ok(codes(r).includes('fee-over-cap')); });
test('a payee address that differs from the last run is a warning that needs a second approval', () => {
  const r = preflight(pay(), ctx({ history: { 'Ada': { chain: 'solana-devnet', address: '3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S', amount: '1000000' } }, person: 'Ada' }));
  assert.equal(r.ok, true); const f = r.findings.find((x) => x.code === 'destination-changed'); assert.ok(f); assert.equal(f.severity, 'warn'); assert.equal(r.needsSecondApproval, true);
});
test('an amount far from the last payment is a warning, not a block', () => {
  const r = preflight(pay({ amount: '1900000' }), ctx({ history: { 'Ada': { chain: 'solana-devnet', address: SOL, amount: '500000' } }, person: 'Ada' }));
  assert.equal(r.ok, true); assert.ok(codes(r).includes('amount-unusual'));
});
test('a block finding always makes ok false even with warnings present', () => {
  const r = preflight(pay({ amount: '9999999' }), ctx({ history: { 'Ada': { chain: 'solana-devnet', address: SOL, amount: '1' } }, person: 'Ada' })); assert.equal(r.ok, false);
});
