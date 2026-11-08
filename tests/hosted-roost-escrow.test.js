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
