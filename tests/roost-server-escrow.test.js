// Lead 9, Task 4: the Roost service's own admin routes bind the escrow read, map a failed read to 503, and can abandon a signed round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoostServer } from '../src/roost-service/server.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { RoostAggregationError } from '../src/enclave/errors.js';
import { sealToModel } from '../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const KEY = 'k'.repeat(30);
let h = 9000;
const reader = (balances, fail = false) => ({ read: async (_s, ids) => { if (fail) throw new RoostAggregationError('could not read escrow: down'); h += 1; return { blockHeight: h, blockHash: `H${h}`, escrows: Object.fromEntries(ids.map((i) => [i, balances[i] ?? '0'])), exitsOpenFromBlock: h + 500 }; } });
const NEAR = (n) => `${n}000000000000000000000000`;

async function serve(escrowReader) {
  const roost = new HostedRoost({ provider, deterministicOrder: true, escrowReader });
  roost.openRound({ contractId: 'c.near', syndicateId: 'g', epoch: 1, roundNonce: 'ab'.repeat(32) }); // the escrow read is for this group
  const server = createRoostServer({ roost, adminKey: KEY });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, key = KEY) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-roost-admin-key': key } : {}) }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
  const seal = (id, body) => roost.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify(body), roost.intentPublicKey) });
  return { roost, post, seal, close: () => new Promise((r) => server.close(r)) };
}

test('POST /pool binds the escrow read itself, leaves out the bidder who cannot pay, and needs the admin key', async () => {
  const s = await serve(reader({ 'a.near': NEAR(1), 'b.near': '0', 'c.near': NEAR(1) }));
  try {
    s.seal('a.near', { amount: '0.01' }); s.seal('b.near', { amount: '0.02' }); s.seal('c.near', { amount: '0.03' });
    assert.equal((await s.post('/pool', { recipient: 'r.near' }, null)).status, 401);
    const r = await s.post('/pool', { recipient: 'r.near', min: '0' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.outcome.excludedForEscrow, ['b.near']);
    assert.deepEqual(r.json.charges.map((c) => c.member).sort(), ['a.near', 'c.near']);
  } finally { await s.close(); }
});

test('POST /ballot reads the roll\'s escrow, so a roll member who never voted but cannot pay is left out', async () => {
  const { provider: fixProvider, keyCheck, ROUND, ROLL, VOTE_PARAMS, voteInputs } = await import('../lab/lib/room-fixtures.js');
  const bal = Object.fromEntries(ROLL.map((m) => [m, NEAR(1)])); bal['m5.near'] = '0'; // m5 never votes, but is still on the roll and so is charged a share
  const roost = new HostedRoost({ provider: fixProvider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true, escrowReader: reader(bal) });
  const server = createRoostServer({ roost, adminKey: KEY });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    roost.openRound(ROUND);
    for (const i of voteInputs(roost).slice(0, 4)) await roost.submitSignedIntent(i); // m5 never votes
    const res = await fetch(`http://127.0.0.1:${server.address().port}/ballot`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-roost-admin-key': KEY }, body: JSON.stringify(VOTE_PARAMS) });
    const json = await res.json();
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.deepEqual(json.outcome.excludedForEscrow, ['m5.near']);
    assert.equal(json.charges.length, 4);
  } finally { await new Promise((r) => server.close(r)); }
});

test('a failed escrow read is 503 and the queue is kept', async () => {
  const s = await serve(reader({}, true));
  try {
    s.seal('a.near', { amount: '0.01' });
    const r = await s.post('/pool', { recipient: 'r.near' });
    assert.equal(r.status, 503);
    assert.equal(s.roost.sealedIntents.length, 1);
  } finally { await s.close(); }
});

test('POST /abandon gives up a signed round and needs the admin key', async () => {
  const s = await serve(null);
  try {
    s.seal('a.near', { amount: '0.01' });
    const agg = (await s.post('/aggregate', {})).json;
    await s.post('/settle', { contractId: 'c.near', syndicateId: 'g', epoch: 1, roundNonce: 'ab'.repeat(32), allocations: [{ recipient: 'r.near', amount: '1000' }], orderHash: agg.orderHash });
    assert.equal((await s.post('/abandon', {}, null)).status, 401);
    const r = await s.post('/abandon', {});
    assert.equal(r.status, 200);
    assert.equal(r.json.abandoned, true);
    assert.equal((await s.post('/abandon', {})).status, 400, 'a second abandon has nothing to abandon');
  } finally { await s.close(); }
});
