import http from 'node:http';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { RoomService } from '../../src/roost-service/room-service.js';
import { createRoomHandler } from '../../src/roost-service/room-http.js';
import { createRateLimiter } from '../../src/roost-service/rate-limit.js';
import { FlyMcpServer, FLY_MCP_TOOLS } from '../../src/mcp/server.js';
import { createRpc } from '../../src/mcp/rpc.js';
import { createMcpHttpHandler } from '../../src/mcp/http.js';
import { RoomsClient, remoteRooms } from '../../src/sdk/rooms.js';
import { ROUND, VOTE_PARAMS, ADMIN_KEY, mkHost, signedInput, voteInputs } from '../lib/room-fixtures.js';

const ROOM_TOOLS = ['midge_describe_rooms', 'midge_open_room_round', 'midge_submit_room_input', 'midge_run_room'];
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const textOf = (r) => JSON.parse(r.result.content[0].text);
const walk = (o, f, path = '') => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { f(k, `${path}/${k}`); walk(v, f, `${path}/${k}`); } };

async function serveMcp(rooms, opts = {}) {
  const mcp = new FlyMcpServer({ mode: 'model', rooms });
  const rpc = createRpc(mcp);
  const handler = createMcpHttpHandler(rpc, { adminKey: ADMIN_KEY, ...opts });
  const server = http.createServer(async (req, res) => { if (!(await handler(req, res))) { res.writeHead(418); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (body, headers = {}, path = '/mcp') => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* empty */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { mcp, rpc, base, post, close: () => new Promise((r) => server.close(r)) };
}
const KEY = { 'x-roost-admin-key': ADMIN_KEY };

export default {
  id: 'E-ROOMSERVICE-04',
  title: 'runRoom slice 4: MCP tools for rooms over stdio and streamable HTTP, one dispatcher, no secret key in any tool',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. Four tools mirror the four verbs; none takes a secret key; the coordinator tools need the coordinator key over HTTP; one dispatcher serves stdio and HTTP; a vote through the tools gives the same settlement as the service. The failure that must not happen: a room opened or run over HTTP with no key, a secret key accepted as a tool argument, or an Origin-less browser attack path (DNS rebinding) left open.',
  limits: ['Offline: a real HTTP server on a local port, and the real stdio binary as a child process pointed at a local rooms server.', 'The protocol subset implemented is initialize, ping, tools/list and tools/call (single and batch) over JSON responses; server-initiated messages and resumable streams are not.', 'One operator plays every member.'],
  async run(ctx) {
    await ctx.step('the tool list: four new tools, ten old ones, no secret key anywhere', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host });
      const withRooms = new FlyMcpServer({ mode: 'model', rooms: svc }).listTools().tools; const without = new FlyMcpServer({ mode: 'model' }).listTools().tools;
      s.assert('without rooms the list is the original ten', without.length === FLY_MCP_TOOLS.length && FLY_MCP_TOOLS.length === 10 && ROOM_TOOLS.every((n) => !without.some((t) => t.name === n)), { actual: without.length });
      s.assert('with rooms it adds exactly the four room tools', withRooms.length === 14 && ROOM_TOOLS.every((n) => withRooms.some((t) => t.name === n)), { actual: withRooms.map((t) => t.name) });
      const bad = []; for (const t of withRooms.filter((x) => ROOM_TOOLS.includes(x.name))) walk(t.inputSchema, (k, p) => { if (/secret|private|mnemonic|seed|password/i.test(k)) bad.push(`${t.name}${p}`); });
      s.assert('no room tool has a parameter that could carry a secret key', bad.length === 0, { actual: bad });
      s.assert('every room tool has a description and an object input schema', withRooms.filter((x) => ROOM_TOOLS.includes(x.name)).every((t) => t.description.length > 20 && t.inputSchema.type === 'object'));
      s.assert('the submit tool says the input must already be signed', /already signed|pre-signed|signed/i.test(withRooms.find((t) => t.name === 'midge_submit_room_input').description));
    });

    await ctx.step('a vote through the tools gives the service\'s settlement', async (s) => {
      const host = mkHost(); const mcp = new FlyMcpServer({ mode: 'model', rooms: new RoomService({ host }) }); const rpc = createRpc(mcp);
      const twinHost = mkHost(); const twin = new RoomService({ host: twinHost }); twin.open(ROUND); for (const i of voteInputs(twinHost)) await twin.submit(i);
      const direct = await twin.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
      const d = textOf(await rpc.handle(call(1, 'midge_describe_rooms', {}), { coordinator: true }));
      s.assert('describe lists seven programs', d.programs.length === 7);
      textOf(await rpc.handle(call(2, 'midge_open_room_round', { round: ROUND }), { coordinator: true }));
      for (const [i, input] of voteInputs(host).entries()) { const r = textOf(await rpc.handle(call(10 + i, 'midge_submit_room_input', { input }), { coordinator: false })); s.assert(`input ${i + 1} accepted without the coordinator key`, r.accepted === true); }
      const run = textOf(await rpc.handle(call(20, 'midge_run_room', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }), { coordinator: true }));
      s.assert('same order hash as the service', run.orderHash === direct.orderHash, { expected: direct.orderHash, actual: run.orderHash });
      s.assert('same contract call arguments', JSON.stringify(run.settlement.args.allocations) === JSON.stringify(direct.settlement.args.allocations) && run.settlement.method === 'settle_batch_charged');
    });

    await ctx.step('the coordinator tools refuse a caller who is not the coordinator', async (s) => {
      const mcp = new FlyMcpServer({ mode: 'model', rooms: new RoomService({ host: mkHost() }) }); const rpc = createRpc(mcp);
      for (const [name, args] of [['midge_open_room_round', { round: ROUND }], ['midge_run_room', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }]]) {
        const r = await rpc.handle(call(1, name, args), { coordinator: false });
        s.assert(`${name} without the coordinator is an error with code NOT_AUTHORISED`, r.error?.data?.code === 'NOT_AUTHORISED' && r.result === undefined, { actual: r });
      }
      const dflt = await rpc.handle(call(2, 'midge_open_room_round', { round: ROUND }));
      s.assert('the default (no context given) is not the coordinator', dflt.error?.data?.code === 'NOT_AUTHORISED');
    });

    await ctx.step('executeTool with no context is not the coordinator', async (s) => {
      const mcp = new FlyMcpServer({ mode: 'model', rooms: new RoomService({ host: mkHost() }) });
      let err = null; try { await mcp.executeTool('midge_open_room_round', { round: ROUND }); } catch (e) { err = e; }
      s.assert('a library caller who passes no context cannot open a round', err?.code === 'NOT_AUTHORISED', { actual: err?.message });
      s.assert('but can read the description', (await mcp.executeTool('midge_describe_rooms', {})).programs.length === 7);
    });

    await ctx.step('an RFQ\'s plain terms need the flag, also through the tools', async (s) => {
      const host = mkHost(); const rpc = createRpc(new FlyMcpServer({ mode: 'model', rooms: new RoomService({ host }) })); const C = { coordinator: true };
      await rpc.handle(call(1, 'midge_open_room_round', { round: ROUND }), C);
      await rpc.handle(call(2, 'midge_submit_room_input', { input: signedInput(host, 'taker.near', { side: 'buy', units: 10, limit: '0.0022', salt: 'f'.repeat(32) }) }), C);
      for (const [i, [id, q]] of Object.entries({ 'maker1.near': { bid: '0.00195', ask: '0.00205' }, 'maker2.near': { bid: '0.0019', ask: '0.002' } }).entries()) await rpc.handle(call(3 + i, 'midge_submit_room_input', { input: signedInput(host, id, q) }), C);
      const params = { taker: 'taker.near', makers: ['maker1.near', 'maker2.near'], pricing: 'first' };
      const plain = textOf(await rpc.handle(call(10, 'midge_run_room', { program: 'rfq', params, round: ROUND }), C));
      s.assert('by default there is no confidential section and no units or notional', !('confidential' in plain) && !/"units"|"notional"/.test(JSON.stringify(plain)), { actual: Object.keys(plain) });
      const asked = textOf(await rpc.handle(call(11, 'midge_run_room', { program: 'rfq', params, round: ROUND, includeConfidential: true }), C));
      s.assert('with includeConfidential true: the terms', asked.confidential?.terms?.units === 10, { actual: asked.confidential });
      const explicitFalse = textOf(await rpc.handle(call(12, 'midge_run_room', { program: 'rfq', params, round: ROUND, includeConfidential: 'yes' }), C));
      s.assert('only the boolean true counts: the string "yes" does not', !('confidential' in explicitFalse));
    });

    await ctx.step('streamable HTTP: the protocol, the key, and the checks around it', async (s) => {
      const host = mkHost(); const api = await serveMcp(new RoomService({ host }));
      try {
        let r = await api.post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        s.assert('initialize answers with a protocol version, server info and the tools capability', r.status === 200 && r.json.id === 1 && r.json.result.protocolVersion && r.json.result.serverInfo?.name && 'tools' in r.json.result.capabilities, { actual: r.json });
        r = await api.post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        s.assert('tools/list over HTTP shows 14 tools', r.json.result.tools.length === 14);
        r = await api.post(call(3, 'midge_describe_rooms', {}));
        s.assert('describe needs no key', r.status === 200 && textOf(r.json).programs.length === 7);
        r = await api.post(call(4, 'midge_open_room_round', { round: ROUND }));
        s.assert('opening a round without the key is HTTP 401 with a JSON-RPC error', r.status === 401 && r.json.error?.code === -32001 && r.json.error.data.code === 'NOT_AUTHORISED' && r.json.id === 4, { actual: r.json });
        r = await api.post(call(5, 'midge_run_room', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }));
        s.assert('running without the key is HTTP 401', r.status === 401);
        r = await api.post(call(6, 'midge_open_room_round', { round: ROUND }), { 'x-roost-admin-key': 'wrong' });
        s.assert('a wrong key is HTTP 401', r.status === 401);
        r = await api.post(call(6, 'midge_open_room_round', { round: ROUND }), { 'x-roost-admin-key': ADMIN_KEY.slice(0, 12) });
        s.assert('a key that is only a prefix of the real one is HTTP 401', r.status === 401);
        r = await api.post({ jsonrpc: '2.0', method: 'ping' });
        s.assert('a ping with no id is a notification: 202 and no body', r.status === 202 && r.text === '');
        r = await api.post([]);
        s.assert('an empty batch is -32600', r.json?.error?.code === -32600, { actual: r.json });
        r = await api.post(call(7, 'midge_open_room_round', { round: ROUND }), KEY);
        s.assert('with the key, the round opens', r.status === 200 && textOf(r.json).roundNonce === ROUND.roundNonce);
        r = await api.post(call(8, 'midge_open_room_round', { round: { ...ROUND, epoch: 2 } }), { authorization: `Bearer ${ADMIN_KEY}` });
        s.assert('a Bearer token works as well', r.status === 200);
        await api.post(call(9, 'midge_open_room_round', { round: ROUND }), KEY);
        for (const [i, input] of voteInputs(host).entries()) { r = await api.post(call(30 + i, 'midge_submit_room_input', { input })); if (i === 0) s.assert('submitting a signed input needs no key', r.status === 200 && textOf(r.json).accepted === true); }
        r = await api.post(call(40, 'midge_run_room', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }), KEY);
        s.assert('the run returns the settlement', r.status === 200 && textOf(r.json).settlement.method === 'settle_batch_charged');
        r = await api.post(call(41, 'midge_run_room', { program: 'raffle', params: {}, round: ROUND }), KEY);
        s.assert('a room error comes back as a JSON-RPC error carrying the room code', r.json.error?.code === -32000 && r.json.error.data.code === 'UNKNOWN_PROGRAM', { actual: r.json });
        r = await api.post(call(42, 'midge_submit_room_input', { input: signedInput(host, 'm1.near', { choice: 'A' }, { tamper: true, seq: 9 }) }));
        s.assert('a forged input is refused with NOT_AUTHORISED (an error, not a crash)', r.json.error?.data?.code === 'NOT_AUTHORISED' || r.json.error?.data?.code === 'ALREADY_SIGNED', { actual: r.json });
        r = await api.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
        s.assert('a notification (no id) gets 202 and no body', r.status === 202 && r.text === '');
        r = await api.post([{ jsonrpc: '2.0', id: 50, method: 'ping' }, { jsonrpc: '2.0', id: 51, method: 'tools/list' }]);
        s.assert('a batch returns an array of responses in order', Array.isArray(r.json) && r.json.length === 2 && r.json[0].id === 50 && r.json[1].id === 51);
        r = await api.post({ jsonrpc: '2.0', id: 52, method: 'resources/subscribe' });
        s.assert('an unknown method is -32601', r.json.error?.code === -32601);
        r = await api.post('{broken');
        s.assert('invalid JSON is HTTP 400 with -32700', r.status === 400 && r.json.error?.code === -32700 && r.json.id === null);
        r = await api.post({ id: 53, method: 'ping' });
        s.assert('a message without jsonrpc "2.0" is -32600', r.json.error?.code === -32600);
        r = await api.post(call(54, 'midge_no_such_tool', {}));
        s.assert('an unknown tool is a JSON-RPC error, not a crash', r.json.error?.code === -32000 && /Unknown/.test(r.json.error.message));
        const g = await fetch(api.base + '/mcp'); s.assert('GET /mcp is 405 with Allow: POST', g.status === 405 && g.headers.get('allow') === 'POST');
        const other = await fetch(api.base + '/other'); s.assert('a path that is not /mcp is not handled here', other.status === 418);
        r = await api.post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' });
        s.assert('a browser request from an origin that is not allowed is refused (DNS-rebinding guard)', r.status === 403, { actual: r.status });
        r = await api.post({ jsonrpc: '2.0', id: 1, method: 'ping' });
        s.assert('a request with no Origin header (an agent, not a browser) is fine', r.status === 200);
        r = await api.post(call(60, 'midge_describe_rooms', {}), { 'x-roost-admin-key': ADMIN_KEY });
        s.assert('responses are never cached', r.headers.get('cache-control') === 'no-store');
      } finally { await api.close(); }
      const ok = await serveMcp(new RoomService({ host: mkHost() }), { allowedOrigins: ['https://midge.vercel.app'] });
      try {
        const r = await ok.post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://midge.vercel.app' });
        s.assert('an origin on the allow-list is accepted', r.status === 200);
        const n = await ok.post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://midge.vercel.app.evil.example' });
        s.assert('an origin that merely starts with an allowed one is refused', n.status === 403);
      } finally { await ok.close(); }
    });

    await ctx.step('limits: body size, and one rate limit shared with the rooms API', async (s) => {
      let t = 5_000_000; const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
      const svc = new RoomService({ host: mkHost() });
      const mcp = new FlyMcpServer({ mode: 'model', rooms: svc }); const mh = createMcpHttpHandler(createRpc(mcp), { adminKey: ADMIN_KEY, rate: limiter, maxBody: 1024 }); const rh = createRoomHandler(svc, { adminKey: ADMIN_KEY, rate: limiter });
      const server = http.createServer(async (req, res) => { if (!(await mh(req, res)) && !(await rh(req, res))) { res.writeHead(404); res.end(); } });
      await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
      try {
        const ping = () => fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
        const a = await ping(); const b = await fetch(base + '/v1/rooms'); const c = await ping(); const d = await fetch(base + '/v1/rooms');
        s.assert('two MCP and one rooms request pass', a.status === 200 && b.status === 200 && c.status === 200, { actual: [a.status, b.status, c.status] });
        s.assert('the fourth, on either door, is 429 because the allowance is shared', d.status === 429 && Number(d.headers.get('retry-after')) === 60, { actual: d.status });
        const dm = await ping(); const body = await dm.json();
        s.assert('over MCP the 429 is a JSON-RPC error with RATE_LIMITED', dm.status === 429 && body.error?.data?.code === 'RATE_LIMITED', { actual: body });
        s.assert('the MCP 429 carries Retry-After too', Number(dm.headers.get('retry-after')) === 60, { actual: dm.headers.get('retry-after') });
        t += 60_000;
        const big = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', pad: 'x'.repeat(4000) }) });
        s.assert('a body over the limit is 413', big.status === 413, { actual: big.status });
        const chunked = await new Promise((resolve, reject) => { const u = new URL(base + '/mcp'); const rq = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); rq.on('error', reject); rq.write('{"jsonrpc":"2.0","id":1,"method":"ping","pad":"'); rq.write('x'.repeat(700)); rq.write('x'.repeat(700)); rq.end('"}'); });
        s.assert('a streamed body over the limit with no declared length is 413 as well', chunked === 413, { actual: chunked });

      } finally { await new Promise((r) => server.close(r)); }
    });

    await ctx.step('the stdio binary uses the same dispatcher and reaches a remote rooms server', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host });
      const rh = createRoomHandler(svc, { adminKey: ADMIN_KEY });
      const server = http.createServer(async (req, res) => { if (!(await rh(req, res))) { res.writeHead(404); res.end(); } });
      await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}`;
      const child = spawn('node', ['bin/midge-mcp.js'], { cwd: ctx.rootDir, env: { ...process.env, FLY_MODE: 'model', MIDGE_ROOMS_URL: url, MIDGE_ROOMS_KEY: ADMIN_KEY }, stdio: ['pipe', 'pipe', 'pipe'] });
      const rl = readline.createInterface({ input: child.stdout }); const pending = new Map();
      rl.on('line', (line) => { try { const m = JSON.parse(line); pending.get(m.id)?.(m); } catch { /* not json */ } });
      const ask = (msg) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`no answer to ${msg.method}`)), 15000); pending.set(msg.id, (m) => { clearTimeout(timer); resolve(m); }); child.stdin.write(JSON.stringify(msg) + '\n'); });
      try {
        const init = await ask({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        s.assert('initialize works on stdio', Boolean(init.result?.protocolVersion));
        const list = await ask({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        s.assert('the stdio server lists the room tools when MIDGE_ROOMS_URL is set', ROOM_TOOLS.every((n) => list.result.tools.some((t) => t.name === n)), { actual: list.result.tools.map((t) => t.name) });
        const d = await ask(call(3, 'midge_describe_rooms', {}));
        s.assert('describe reaches the remote rooms server', textOf(d).programs.length === 7 && textOf(d).settlePublicKey === host.settlePublicKey);
        await ask(call(4, 'midge_open_room_round', { round: ROUND }));
        for (const [i, input] of voteInputs(host).entries()) await ask(call(10 + i, 'midge_submit_room_input', { input }));
        const run = await ask(call(20, 'midge_run_room', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }));
        s.assert('a vote run through the stdio binary returns the finished contract call', textOf(run).settlement?.method === 'settle_batch_charged' && textOf(run).outcome.winner === 'A', { actual: run });
        const err = await ask(call(21, 'midge_run_room', { program: 'raffle', params: {}, round: ROUND }));
        s.assert('a room error over stdio carries the room code', err.error?.data?.code === 'UNKNOWN_PROGRAM', { actual: err });
      } finally { child.kill(); rl.close(); await new Promise((r) => server.close(r)); }
    });
  },
};
