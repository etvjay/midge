// Lead 9, Task 4 (+ amendment): RoomService binds the escrow read itself, maps a failed read to UNAVAILABLE, and can abandon a rejected round.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { RoomService, RoomError } from '../src/roost-service/room-service.js';
import { createRoomHandler, STATUS_OF } from '../src/roost-service/room-http.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { RoostAggregationError } from '../src/enclave/errors.js';
import { provider, keyCheck, ROUND, ROLL, VOTE_PARAMS, voteInputs, signedInput, ADMIN_KEY } from '../lab/lib/room-fixtures.js';

const BIG = '50000000000000000000000';
let height = 5000;
const reader = (balances, { fail = false } = {}) => ({ read: async (_s, ids) => { if (fail) throw new RoostAggregationError('could not read escrow: providers disagree'); const h = ++height; return { blockHeight: h, blockHash: `H${h}`, escrows: Object.fromEntries(ids.map((i) => [i, balances[i] ?? '0'])), exitsOpenFromBlock: h + 1000 }; } });
const everyone = Object.fromEntries(ROLL.map((m) => [m, BIG]));
async function room(escrowReader) {
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true, escrowReader });
  const svc = new RoomService({ host }); svc.open(ROUND);
  for (const i of voteInputs(host)) await svc.submit(i);
  return { host, svc };
}
const runBallot = (svc) => svc.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });

test('run reads the escrow of the roll as well as the voters, leaves out the member who cannot pay, and returns a settlement without them', async () => {
  const { svc } = await room(reader({ ...everyone, 'm4.near': '0' }));
  const res = await runBallot(svc);
  assert.deepEqual(res.outcome.excludedForEscrow, ['m4.near']);
  assert.equal(res.settlement.args.charges.length, 4);
  assert.ok(!res.settlement.args.charges.some((c) => c.member === 'm4.near'));
  assert.equal(res.outcome.escrowBlock.raceFree, true);
});

test('a failed read is UNAVAILABLE (503), the queue is kept, and nothing was signed', async () => {
  const { host, svc } = await room(reader({}, { fail: true }));
  const queued = host.sealedIntents.length;
  await assert.rejects(() => runBallot(svc), (e) => e instanceof RoomError && e.code === 'UNAVAILABLE');
  assert.equal(STATUS_OF.UNAVAILABLE, 503);
  assert.equal(host.sealedIntents.length, queued);
  assert.equal(host.aggregate, null);
});

test('with no reader the service behaves as before', async () => {
  const { svc } = await room(null);
  const res = await runBallot(svc);
  assert.equal(res.outcome.excludedForEscrow, undefined);
  assert.equal(res.settlement.args.charges.length, 5);
});

test('abandon: after a signed round the contract rejected, the coordinator can abandon it, members re-submit with a higher seq, and the room settles again', async () => {
  const { host, svc } = await room(reader(everyone));
  const first = await runBallot(svc);
  assert.ok(first.settlement);
  await assert.rejects(() => svc.run({ program: 'ballot', params: { ...VOTE_PARAMS, quorumBps: 4000 }, round: ROUND }), (e) => e.code === 'ALREADY_SIGNED');
  const a = svc.abandon(ROUND);
  assert.equal(a.abandoned, true); assert.equal(a.orderHash, first.orderHash);
  assert.equal(host.abandoned.length, 1);
  for (const i of voteInputs(host, undefined, { seq: 2 })) await svc.submit(i);
  const second = await runBallot(svc);
  assert.ok(second.settlement, 'a second settlement was signed');
});

test('abandon is refused for a round that is not open, and when nothing was signed', async () => {
  const { svc } = await room(reader(everyone));
  assert.throws(() => svc.abandon({ ...ROUND, roundNonce: 'ee'.repeat(32) }), (e) => e.code === 'ROUND_NOT_OPEN');
  assert.throws(() => svc.abandon(ROUND), (e) => e.code === 'INVALID_PARAMS' && /nothing to abandon/.test(e.message));
});

test('abandon over HTTP needs the coordinator key', async () => {
  const { svc } = await room(reader(everyone));
  await runBallot(svc);
  const handler = createRoomHandler(svc, { adminKey: ADMIN_KEY });
  const server = http.createServer(async (req, res) => { if (!(await handler(req, res))) { res.writeHead(418); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const post = (headers) => fetch(`http://127.0.0.1:${server.address().port}/v1/rooms/abandon`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ round: ROUND }) });
  try {
    assert.equal((await post({})).status, 401);
    const ok = await post({ 'x-roost-admin-key': ADMIN_KEY });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).abandoned, true);
  } finally { await new Promise((r) => server.close(r)); }
});
