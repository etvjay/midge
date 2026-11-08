// Audit run-1, leads 13 and 15.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('test-no-hardware'), info: async () => ({}) };
const ROUND_A = { contractId: 'c.near', syndicateId: 'vote', epoch: 1, roundNonce: 'ab'.repeat(32) };
const ROUND_B = { ...ROUND_A, roundNonce: 'cd'.repeat(32) };

test('lead 13: a cross that cannot be settled does not throw away the sealed orders', async () => {
  const host = new HostedRoost({ provider, deterministicOrder: true });
  const seal = (flyerId, order) => host.submitSealedIntent({ flyerId, cipherTextHex: sealToModel(JSON.stringify(order), host.intentPublicKey) });
  for (let i = 1; i <= 9; i += 1) seal(`seller${i}.near`, { side: 'sell', units: 1, limit: '1' });
  seal('buyer.near', { side: 'buy', units: 100, limit: '2' });
  assert.equal(host.sealedIntents.length, 10);
  await assert.rejects(async () => host.runCross({ referencePrice: '1' }), /at most 8 sellers/);
  assert.equal(host.sealedIntents.length, 10, 'the honest orders must still be queued');
});

test('lead 15: an input signed for the old round is not queued into the new one', async () => {
  const kp = nearKeyPair();
  let release;
  const gate = new Promise((r) => { release = r; });
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async () => { await gate; return true; }, deterministicOrder: true });
  host.openRound(ROUND_A);
  const cipherTextHex = sealToModel(JSON.stringify({ choice: 'A' }), host.intentPublicKey);
  const signature = signInputWithNearKey(kp.secretKey, inputMessage({ ...ROUND_A, flyerId: 'm1.near', seq: 1, cipherTextHex }));
  const pending = host.submitSignedIntent({ flyerId: 'm1.near', cipherTextHex, publicKey: kp.publicKey, signature, seq: 1 });
  host.openRound(ROUND_B); // the coordinator opens the next round while the key check is still out
  release();
  await assert.rejects(pending, /round changed/);
  assert.equal(host.sealedIntents.length, 0);
  assert.equal(host.lastSeq.size, 0);
});

// ---- Plan 09-1, Task 7 (hole H1): one signed settlement per round ----
import { mkHost as mkSignedHost, signedInput, ROUND as FIX_ROUND, ROLL, VOTE_PARAMS, voteInputs } from '../lab/lib/room-fixtures.js';
import { generateClientKey } from '../src/enclave/e2ee.js';

const ctx = FIX_ROUND; // { contractId, syndicateId, epoch, roundNonce }
const SALT = 'f'.repeat(32);
const sealed = (host, id, body) => host.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify(body), host.intentPublicKey) });
const payee = generateClientKey(); const employerRead = generateClientKey(); const auditor = generateClientKey();
const LINES = [{ payee: 'm2.near', person: 'Alice', invoiceId: 'INV-1', period: '2026-11', gross: '0.05', tax: '0.0075', benefits: '0.0025', payeeKey: payee.publicKeyHex }];

const PROGRAMS = {
  pool: { host: () => new HostedRoost({ provider, deterministicOrder: true }), fill: async (h) => { sealed(h, 'a.near', { amount: '0.01' }); sealed(h, 'b.near', { amount: '0.02' }); }, more: async (h) => sealed(h, 'c.near', { amount: '0.03' }), run: (h) => h.runPool({ recipient: 'r.near', min: '0' }) },
  auction: { host: () => new HostedRoost({ provider, deterministicOrder: true }), fill: async (h) => { sealed(h, 'a.near', { price: '0.009' }); sealed(h, 'b.near', { price: '0.007' }); }, more: async (h) => sealed(h, 'c.near', { price: '0.006' }), run: (h) => h.runAuction({ format: 'second-price', seller: 's.near', lotUnits: 1, reserve: '0' }) },
  quote: { host: () => new HostedRoost({ provider, deterministicOrder: true }), fill: async (h) => { sealed(h, 'l1', { rateBps: 450 }); sealed(h, 'l2', { rateBps: 400 }); }, more: async (h) => sealed(h, 'l3', { rateBps: 500 }), run: (h) => h.runQuote({ shape: 'lend', counterparty: 'borrower', amount: '5', limit: 700 }) },
  cross: { host: () => new HostedRoost({ provider, deterministicOrder: true }), fill: async (h) => { sealed(h, 'b1', { side: 'buy', units: 10, limit: '1.10' }); sealed(h, 's1', { side: 'sell', units: 8, limit: '0.95' }); }, more: async (h) => sealed(h, 'b2', { side: 'buy', units: 5, limit: '1.05' }), run: (h) => h.runCross({ referencePrice: '1.00' }) },
  ballot: { host: mkSignedHost, fill: async (h) => { for (const i of voteInputs(h)) await h.submitSignedIntent(i); }, more: async (h) => h.submitSignedIntent(signedInput(h, ROLL[0], { choice: 'B' }, { seq: 2 })), run: (h) => h.runBallot(VOTE_PARAMS) },
  rfq: { host: mkSignedHost, fill: async (h) => { await h.submitSignedIntent(signedInput(h, 'taker.near', { side: 'buy', units: 10, limit: '0.0022', salt: SALT })); await h.submitSignedIntent(signedInput(h, 'maker1.near', { bid: '0.00195', ask: '0.00205' })); await h.submitSignedIntent(signedInput(h, 'maker2.near', { bid: '0.0019', ask: '0.002' })); }, more: async (h) => h.submitSignedIntent(signedInput(h, 'maker1.near', { bid: '0.0019', ask: '0.0021' }, { seq: 2 })), run: (h) => h.runRfq({ taker: 'taker.near', makers: ['maker1.near', 'maker2.near'], pricing: 'first' }) },
  payrun: { host: mkSignedHost, fill: async (h) => { await h.submitSignedIntent(signedInput(h, 'm1.near', { lines: LINES })); }, more: async (h) => h.submitSignedIntent(signedInput(h, 'm1.near', { lines: LINES }, { seq: 2 })), run: (h) => h.runPayrun({ employer: 'm1.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: employerRead.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: 'run-1' }) },
};

for (const [name, p] of Object.entries(PROGRAMS)) {
  test(`H1 ${name}: a run after a signed settlement in the same round is refused and the queue is kept`, async () => {
    const h = p.host(); h.openRound(ctx); await p.fill(h);
    const out = p.run(h);
    h.signSettlement({ ...ctx, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
    await p.more(h);
    const queued = h.sealedIntents.length;
    assert.ok(queued > 0, 'a new input is waiting');
    assert.throws(() => p.run(h), /already has a signed settlement/);
    assert.equal(h.sealedIntents.length, queued, 'the queue must be untouched');
    h.openRound({ ...ctx, roundNonce: 'cd'.repeat(32) });
    assert.equal(h.aggregate, null, 'a new round starts clean');
  });
}

for (const name of ['pool', 'ballot']) {
  test(`H1 ${name}: running again before anything was signed is still allowed`, async () => {
    const p = PROGRAMS[name]; const h = p.host(); h.openRound(ctx); await p.fill(h);
    p.run(h); await p.more(h);
    assert.doesNotThrow(() => p.run(h));
  });
}

// ---- Review of plan 09-1, finding 1: R-01 must hold for every way of producing an aggregate and for a re-opened round ----
test('R-01: aggregateAndClear after a signed settlement in the same round is refused and the queue is kept', async () => {
  const h = new HostedRoost({ provider, deterministicOrder: true }); h.openRound(ctx);
  sealed(h, 'a.near', { amount: '0.01' });
  const agg = h.aggregateAndClear();
  h.signSettlement({ ...ctx, allocations: [{ recipient: 'r.near', amount: '1000' }], orderHash: agg.orderHash });
  sealed(h, 'b.near', { amount: '0.02' });
  assert.throws(() => h.aggregateAndClear(), /already has a signed settlement/);
  assert.equal(h.sealedIntents.length, 1, 'the queue must be untouched');
});

test('R-01: a round that was already signed cannot be opened again with the same nonce, so the guard cannot be reset', async () => {
  const h = new HostedRoost({ provider, deterministicOrder: true }); h.openRound(ctx);
  sealed(h, 'a.near', { amount: '0.01' });
  const agg = h.aggregateAndClear();
  h.signSettlement({ ...ctx, allocations: [{ recipient: 'r.near', amount: '1000' }], orderHash: agg.orderHash });
  assert.throws(() => h.openRound(ctx), /already signed/);
  assert.doesNotThrow(() => h.openRound({ ...ctx, roundNonce: 'ef'.repeat(32) }), 'a new nonce is a new round');
});
