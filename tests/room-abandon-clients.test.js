// Abandon and the pinned block must reach every door: the MCP tool and the SDK client (the web route and the service already have them).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FlyMcpServer } from '../src/mcp/server.js';
import { createRpc } from '../src/mcp/rpc.js';
import { ROOM_TOOLS, COORDINATOR_ONLY, PUBLIC_OVER_HTTP } from '../src/mcp/rooms-tools.js';
import { RoomService } from '../src/roost-service/room-service.js';
import { createRoomHandler } from '../src/roost-service/room-http.js';
import { RoomsClient, remoteRooms } from '../src/sdk/rooms.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { provider, keyCheck, ROUND, ROLL, VOTE_PARAMS, voteInputs, ADMIN_KEY } from '../lab/lib/room-fixtures.js';

const BIG = '50000000000000000000000';
const seen = [];
const reader = { read: async (_s, ids, opts) => { seen.push(opts); const h = opts?.blockHash ? 7000 : 6000; return { blockHeight: h, blockHash: opts?.blockHash ?? `H${h}`, blockTimeMs: Date.now(), escrows: Object.fromEntries(ids.map((i) => [i, BIG])), exitsOpenFromBlock: h + 1000 }; } };
async function room(escrowReader = null) {
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true, escrowReader });
  const svc = new RoomService({ host }); svc.open(ROUND);
  for (const i of voteInputs(host)) await svc.submit(i);
  return { host, svc };
}
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const textOf = (res) => JSON.parse(res.result.content[0].text);

test('MCP: there is an abandon tool, it is coordinator-only, takes no secret, and needs a round', () => {
  const t = new FlyMcpServer({ mode: 'model', rooms: new RoomService({ host: new HostedRoost({ provider }) }) }).listTools().tools.find((x) => x.name === 'midge_abandon_room_round');
  assert.ok(t, 'the tool is listed');
  assert.deepEqual(t.inputSchema.required, ['round']);
  assert.ok(COORDINATOR_ONLY.has('midge_abandon_room_round'));
  assert.ok(!PUBLIC_OVER_HTTP.has('midge_abandon_room_round'));
  assert.ok(ROOM_TOOLS.some((x) => x.name === 'midge_abandon_room_round'));
  assert.doesNotMatch(JSON.stringify(t.inputSchema), /secret|private|mnemonic|seed|password/i);
});

test('MCP: abandon needs the coordinator, works after a signed run, and refuses when nothing was signed', async () => {
  const { svc } = await room();
  const rpc = createRpc(new FlyMcpServer({ mode: 'model', rooms: svc }));
  const denied = await rpc.handle(call(1, 'midge_abandon_room_round', { round: ROUND }), { coordinator: false });
  assert.equal(denied.error?.data?.code, 'NOT_AUTHORISED');
  const nothing = await rpc.handle(call(2, 'midge_abandon_room_round', { round: ROUND }), { coordinator: true });
  assert.equal(nothing.error?.data?.code, 'INVALID_PARAMS');
  textOf(await rpc.handle(call(3, 'midge_run_room', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }), { coordinator: true }));
  const ok = textOf(await rpc.handle(call(4, 'midge_abandon_room_round', { round: ROUND }), { coordinator: true }));
  assert.equal(ok.abandoned, true);
  assert.match(ok.messageSha256, /^[0-9a-f]{64}$/);
});

test('MCP: midge_run_room passes a pinned block to the escrow read', async () => {
  const { svc } = await room(reader);
  const rpc = createRpc(new FlyMcpServer({ mode: 'model', rooms: svc }));
  const out = textOf(await rpc.handle(call(1, 'midge_run_room', { program: 'ballot', params: VOTE_PARAMS, round: ROUND, escrowBlockHash: 'HASH7000' }), { coordinator: true }));
  assert.equal(out.outcome.escrowBlock.hash, 'HASH7000');
  assert.equal(seen.at(-1).blockHash, 'HASH7000');
  assert.ok(ROOM_TOOLS.find((t) => t.name === 'midge_run_room').inputSchema.properties.escrowBlockHash);
});

async function served(svc) {
  const handler = createRoomHandler(svc, { adminKey: ADMIN_KEY });
  const server = http.createServer(async (req, res) => { if (!(await handler(req, res))) { res.writeHead(418); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

test('SDK: abandon posts the round with the coordinator key, and run passes a pinned block', async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined }); return { ok: true, status: 200, headers: new Headers(), json: async () => ({ abandoned: true }) }; };
  const c = new RoomsClient({ baseUrl: 'http://x', adminKey: 'K', fetch: fake });
  await c.abandon(ROUND);
  assert.deepEqual(calls[0], { url: 'http://x/v1/rooms/abandon', method: 'POST', headers: { 'content-type': 'application/json', 'x-roost-admin-key': 'K' }, body: { round: ROUND } });
  await c.run({ program: 'ballot', params: {}, round: ROUND, escrowBlockHash: 'HASH7000' });
  assert.equal(calls[1].body.escrowBlockHash, 'HASH7000');
  assert.equal(typeof remoteRooms(c).abandon, 'function');
});

test('SDK end to end: run, abandon and run again through the real web handler', async () => {
  const { host, svc } = await room(reader);
  const s = await served(svc);
  try {
    const c = new RoomsClient({ baseUrl: s.base, adminKey: ADMIN_KEY });
    const first = await c.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
    assert.ok(first.settlement);
    const a = await c.abandon(ROUND);
    assert.equal(a.abandoned, true); assert.equal(a.orderHash, first.orderHash);
    for (const i of voteInputs(host, undefined, { seq: 2 })) await c.submit(i);
    assert.ok((await c.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND, escrowBlockHash: 'HASH7000' })).settlement);
    await assert.rejects(() => new RoomsClient({ baseUrl: s.base }).abandon(ROUND), (e) => e.status === 401);
  } finally { await s.close(); }
});
