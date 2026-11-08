// Lead 9, Task 2: bindEscrow and the affordability filter, first for the ballot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { provider, keyCheck, ROUND, ROLL, VOTE_PARAMS, voteInputs, signedInput } from '../lab/lib/room-fixtures.js';

const SHARE = '10000000000000000000000'; // 0.01 NEAR in yocto: VOTE_PARAMS.share
const BIG = '50000000000000000000000';
let height = 1000;
/** A stub reader: balances per account, a rising block height by default. */
function stub(balances, { fixedHeight = null, calls = [] } = {}) {
  return { read: async (syndicateId, ids) => { const h = fixedHeight ?? ++height; calls.push({ syndicateId, ids: [...ids] }); return { blockHeight: h, blockHash: `HASH${h}`, escrows: Object.fromEntries(ids.map((i) => [i, balances[i] ?? '0'])) }; } };
}
const host = (reader) => new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true, escrowReader: reader });
async function filled(reader) { const h = host(reader); h.openRound(ROUND); for (const i of voteInputs(h)) await h.submitSignedIntent(i); return h; }
const everyone = Object.fromEntries(ROLL.map((m) => [m, BIG]));

test('a roll member with no escrow is left out, named, and the rest settle', async () => {
  const h = await filled(stub({ ...everyone, 'm4.near': '0' }));
  await h.bindEscrow({ accounts: ROLL });
  const out = h.runBallot(VOTE_PARAMS);
  assert.deepEqual(out.outcome.excludedForEscrow, ['m4.near']);
  assert.equal(out.charges.length, 4);
  assert.ok(!out.charges.some((c) => c.member === 'm4.near'));
  assert.equal(out.allocations[0].amount, String(BigInt(SHARE) * 4n), 'the pool is four shares');
  assert.doesNotThrow(() => h.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges }));
});

test('escrow exactly equal to the share is kept; one yocto less is left out', async () => {
  const exact = await filled(stub({ ...everyone, 'm4.near': SHARE }));
  await exact.bindEscrow({ accounts: ROLL });
  assert.deepEqual(exact.runBallot(VOTE_PARAMS).outcome.excludedForEscrow, []);
  const short = await filled(stub({ ...everyone, 'm4.near': String(BigInt(SHARE) - 1n) }));
  await short.bindEscrow({ accounts: ROLL });
  assert.deepEqual(short.runBallot(VOTE_PARAMS).outcome.excludedForEscrow, ['m4.near']);
});

test('with a reader configured, a run without bindEscrow throws and keeps the queue', async () => {
  const h = await filled(stub(everyone));
  const queued = h.sealedIntents.length;
  assert.throws(() => h.runBallot(VOTE_PARAMS), /bind/i);
  assert.equal(h.sealedIntents.length, queued);
});

test('an input that arrives after bindEscrow makes the next run throw and leaves the queue alone', async () => {
  const h = await filled(stub(everyone));
  await h.bindEscrow({ accounts: ROLL });
  await h.submitSignedIntent(signedInput(h, 'outsider.near', { choice: 'A' }));
  const queued = h.sealedIntents.length;
  assert.throws(() => h.runBallot(VOTE_PARAMS), /bind again|new input/i);
  assert.equal(h.sealedIntents.length, queued);
});

test('a roll member that bindEscrow was not told about makes the run throw', async () => {
  const h = await filled(stub(everyone));
  await h.bindEscrow(); // no accounts: the roll was not read
  assert.throws(() => h.runBallot({ ...VOTE_PARAMS, roll: [...ROLL, 'taker.near'] }), /bind/i);
});

test('openRound drops the snapshot', async () => {
  const h = await filled(stub(everyone));
  await h.bindEscrow({ accounts: ROLL });
  h.openRound({ ...ROUND, roundNonce: 'cd'.repeat(32) });
  for (const i of voteInputs(h, undefined, { round: { ...ROUND, roundNonce: 'cd'.repeat(32) } })) await h.submitSignedIntent(i);
  assert.throws(() => h.runBallot(VOTE_PARAMS), /bind/i);
});

test('the snapshot is single-use: a second run needs a fresh bindEscrow', async () => {
  const h = await filled(stub(everyone));
  await h.bindEscrow({ accounts: ROLL });
  h.runBallot({ ...VOTE_PARAMS, quorumBps: 10000, roll: ROLL }); // may or may not decide; either way it consumed the snapshot
  for (const i of voteInputs(h, undefined, { seq: 2 })) await h.submitSignedIntent(i);
  assert.throws(() => h.runBallot(VOTE_PARAMS), /bind/i);
});

test('the signed order hash depends on the block that was read', async () => {
  const mk = async (fixedHeight) => { const h = await filled(stub(everyone, { fixedHeight })); await h.bindEscrow({ accounts: ROLL }); return h.runBallot(VOTE_PARAMS).orderHash; };
  const a = await mk(2000); const b = await mk(2001);
  assert.notEqual(a, b);
});

test('a second bindEscrow that returns an older block is refused', async () => {
  let h = 3000; const reader = { read: async (s, ids) => ({ blockHeight: h, blockHash: `H${h}`, escrows: Object.fromEntries(ids.map((i) => [i, BIG])) }) };
  const host1 = await filled(reader);
  await host1.bindEscrow({ accounts: ROLL });
  h = 2999;
  await assert.rejects(() => host1.bindEscrow({ accounts: ROLL }), /older|backwards/i);
});

test('a reader failure propagates, sets no snapshot and keeps the queue', async () => {
  const h = await filled({ read: async () => { throw Object.assign(new Error('could not read escrow: providers disagree'), { name: 'RoostAggregationError' }); } });
  const queued = h.sealedIntents.length;
  await assert.rejects(() => h.bindEscrow({ accounts: ROLL }), /could not read escrow/);
  assert.throws(() => h.runBallot(VOTE_PARAMS), /bind/i);
  assert.equal(h.sealedIntents.length, queued);
});

test('everyone unable to pay: the ballot is undecided and says why, with nothing to sign', async () => {
  const h = await filled(stub({}));
  await h.bindEscrow({ accounts: ROLL });
  const out = h.runBallot(VOTE_PARAMS);
  assert.equal(out.orderHash, null);
  assert.equal(out.outcome.reason, 'no-eligible-members');
  assert.equal(out.outcome.excludedForEscrow.length, 5);
});

test('with no reader configured nothing changes and bindEscrow says there is none', async () => {
  const h = host(null); h.openRound(ROUND); for (const i of voteInputs(h)) await h.submitSignedIntent(i);
  assert.equal(h.runBallot(VOTE_PARAMS).outcome.excludedForEscrow, undefined);
  await assert.rejects(() => h.bindEscrow(), /no escrow reader/);
});

// ---- Lead 9, Task 3: the other six programs ----
import { sealToModel, generateClientKey } from '../src/enclave/e2ee.js';
import { signedInput as signedIn, mkHost as mkSigned } from '../lab/lib/room-fixtures.js';

const NEAR = (n) => `${n}000000000000000000000000`;
const sealedTo = (h, id, body) => h.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify(body), h.intentPublicKey) });
const plainHost = (reader) => new HostedRoost({ provider, deterministicOrder: true, escrowReader: reader });
const signedHost = (reader) => new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true, escrowReader: reader });
const sign = (h, out) => h.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
const richPlus = (ids, poor) => Object.fromEntries(ids.map((i) => [i, i === poor ? '0' : NEAR(1000)]));
const SALT = 'f'.repeat(32);
const er = generateClientKey(); const au = generateClientKey(); const pe = generateClientKey();

const BIDDER = {
  pool: { host: plainHost, ids: ['a.near', 'b.near', 'c.near'], poor: 'b.near', fill: (h) => { sealedTo(h, 'a.near', { amount: '0.01' }); sealedTo(h, 'b.near', { amount: '0.02' }); sealedTo(h, 'c.near', { amount: '0.03' }); }, run: (h) => h.runPool({ recipient: 'r.near', min: '0' }), charged: (o) => o.charges.map((c) => c.member).sort() , expect: ['a.near', 'c.near'] },
  auction: { host: plainHost, ids: ['a.near', 'b.near', 'c.near'], poor: 'a.near', fill: (h) => { sealedTo(h, 'a.near', { price: '0.009' }); sealedTo(h, 'b.near', { price: '0.007' }); sealedTo(h, 'c.near', { price: '0.006' }); }, run: (h) => h.runAuction({ format: 'second-price', seller: 's.near', lotUnits: 1, reserve: '0' }), charged: (o) => o.charges.map((c) => c.member), expect: ['b.near'] },
  'quote (lend)': { host: plainHost, ids: ['l1.near', 'l2.near', 'l3.near'], poor: 'l2.near', fill: (h) => { sealedTo(h, 'l1.near', { rateBps: 450 }); sealedTo(h, 'l2.near', { rateBps: 400 }); sealedTo(h, 'l3.near', { rateBps: 500 }); }, run: (h) => h.runQuote({ shape: 'lend', counterparty: 'borrower.near', amount: '5', limit: 700 }), charged: (o) => o.charges.map((c) => c.member), expect: ['l1.near'] },
  cross: { host: plainHost, ids: ['b1.near', 'b2.near', 's1.near'], poor: 'b1.near', fill: (h) => { sealedTo(h, 'b1.near', { side: 'buy', units: 10, limit: '1.10' }); sealedTo(h, 'b2.near', { side: 'buy', units: 5, limit: '1.05' }); sealedTo(h, 's1.near', { side: 'sell', units: 8, limit: '0.95' }); }, run: (h) => h.runCross({ referencePrice: '1.00' }), charged: (o) => o.charges.map((c) => c.member), expect: ['b2.near'] },
  'rfq (sell)': { host: signedHost, ids: ['taker.near', 'maker1.near', 'maker2.near'], poor: 'maker1.near', signed: true, fill: async (h) => { await h.submitSignedIntent(signedIn(h, 'taker.near', { side: 'sell', units: 10, limit: '0.0018', salt: SALT })); await h.submitSignedIntent(signedIn(h, 'maker1.near', { bid: '0.00195', ask: '0.00205' })); await h.submitSignedIntent(signedIn(h, 'maker2.near', { bid: '0.0019', ask: '0.002' })); }, run: (h) => h.runRfq({ taker: 'taker.near', makers: ['maker1.near', 'maker2.near'], pricing: 'first' }), charged: (o) => o.charges.map((c) => c.member), expect: ['maker2.near'] },
};

for (const [name, p] of Object.entries(BIDDER)) {
  test(`${name}: a bidder who cannot cover their worst case is left out and named, and the rest settle`, async () => {
    const h = p.host(stub(richPlus(p.ids, p.poor))); h.openRound(ROUND); await p.fill(h);
    await h.bindEscrow();
    const out = p.run(h);
    assert.deepEqual(out.outcome.excludedForEscrow, [p.poor]);
    assert.deepEqual(p.charged(out).sort(), p.expect);
    assert.doesNotThrow(() => sign(h, out), 'the contract-side check cannot trip on an unescrowed charge');
  });
  test(`${name}: with everyone able to pay nothing is left out`, async () => {
    const h = p.host(stub(richPlus(p.ids, null))); h.openRound(ROUND); await p.fill(h);
    await h.bindEscrow();
    assert.deepEqual(p.run(h).outcome.excludedForEscrow, []);
  });
  test(`${name}: without bindEscrow the run throws and the queue is kept`, async () => {
    const h = p.host(stub(richPlus(p.ids, null))); h.openRound(ROUND); await p.fill(h);
    const q = h.sealedIntents.length;
    assert.throws(() => p.run(h), /bind/i);
    assert.equal(h.sealedIntents.length, q);
  });
}

test('quote (buy): the paying counterparty must cover units x limit, otherwise the round refuses and keeps the queue', async () => {
  const mk = async (bal) => { const h = plainHost(stub({ 'buyer.near': bal, 'l1.near': NEAR(1), 'l2.near': NEAR(1) })); h.openRound(ROUND); sealedTo(h, 'l1.near', { price: '1.5' }); sealedTo(h, 'l2.near', { price: '1.2' }); await h.bindEscrow({ accounts: ['buyer.near'] }); return h; };
  const run = (h) => h.runQuote({ shape: 'buy', counterparty: 'buyer.near', units: 3, limit: '2' }); // worst case 6 NEAR
  const poor = await mk(NEAR(5)); const q = poor.sealedIntents.length;
  assert.throws(() => run(poor), /cannot cover/);
  assert.equal(poor.sealedIntents.length, q);
  const rich = await mk(NEAR(6)); assert.doesNotThrow(() => run(rich));
});

test('rfq (buy): the taker must cover units x limit, otherwise the round refuses and keeps the queue', async () => {
  const mk = async (bal) => { const h = signedHost(stub({ 'taker.near': bal, 'maker1.near': NEAR(9), 'maker2.near': NEAR(9) })); h.openRound(ROUND); await h.submitSignedIntent(signedIn(h, 'taker.near', { side: 'buy', units: 10, limit: '0.0022', salt: SALT })); await h.submitSignedIntent(signedIn(h, 'maker1.near', { bid: '0.00195', ask: '0.00205' })); await h.submitSignedIntent(signedIn(h, 'maker2.near', { bid: '0.0019', ask: '0.002' })); await h.bindEscrow(); return h; };
  const run = (h) => h.runRfq({ taker: 'taker.near', makers: ['maker1.near', 'maker2.near'], pricing: 'first' }); // worst case 0.022 NEAR
  const poor = await mk('0'); const q = poor.sealedIntents.length;
  assert.throws(() => run(poor), /cannot cover/);
  assert.equal(poor.sealedIntents.length, q);
  const rich = await mk(NEAR(1));
  assert.doesNotThrow(() => run(rich));
});

test('payrun: the employer must cover the gross pay, otherwise the run refuses and keeps the queue', async () => {
  const LINES = [{ payee: 'm2.near', person: 'Alice', invoiceId: 'INV-1', period: '2026-11', gross: '0.05', tax: '0.0075', benefits: '0.0025', payeeKey: pe.publicKeyHex }];
  const mk = async (bal) => { const h = signedHost(stub({ 'm1.near': bal })); h.openRound(ROUND); await h.submitSignedIntent(signedIn(h, 'm1.near', { lines: LINES })); await h.bindEscrow(); return h; };
  const run = (h) => h.runPayrun({ employer: 'm1.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: er.publicKeyHex, auditorKeyHex: au.publicKeyHex, runId: 'run-1' });
  const poor = await mk('1000'); const q = poor.sealedIntents.length;
  assert.throws(() => run(poor), /cannot cover/);
  assert.equal(poor.sealedIntents.length, q);
  const rich = await mk(NEAR(1));
  assert.doesNotThrow(() => run(rich));
});

for (const [name, p] of Object.entries(BIDDER)) {
  test(`${name}: if nobody can pay, the round is undecided, names everyone, and there is nothing to sign`, async () => {
    const h = p.host(stub(Object.fromEntries(p.ids.map((i) => [i, '0'])))); h.openRound(ROUND); await p.fill(h);
    await h.bindEscrow();
    const out = p.run(h);
    assert.equal(out.orderHash, null);
    assert.deepEqual(out.allocations, []);
    assert.ok(out.outcome.excludedForEscrow.length >= 1);
  });
}
