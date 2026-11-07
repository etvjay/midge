import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { RoomService, RoomError } from '../../src/roost-service/room-service.js';
import { createRoomHandler, ROUTES } from '../../src/roost-service/room-http.js';
import { buildOpenApi } from '../../src/roost-service/room-openapi.js';
import { RoomsClient } from '../../src/sdk/rooms.js';
import { ROUND, VOTE_PARAMS, ADMIN_KEY, mkHost, signedInput, voteInputs, keys } from '../lib/room-fixtures.js';

async function serve(service, opts = {}) {
  const handler = createRoomHandler(service, { adminKey: ADMIN_KEY, ...opts });
  const server = http.createServer(async (req, res) => { if (!(await handler(req, res))) { res.writeHead(418); res.end('not a room route'); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, headers: res.headers, json, text };
  };
  return { server, base, call, close: () => new Promise((r) => server.close(r)) };
}
const AUTH = { 'x-roost-admin-key': ADMIN_KEY };
// A POST with no Content-Length (chunked), so the size limit has to be enforced on the stream, not on a declared length.
const chunkedPost = (base, path, chunks) => new Promise((resolve, reject) => {
  const u = new URL(base + path);
  const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, text: t, hadLength: 'content-length' in req.getHeaders() })); });
  req.on('error', reject); for (const c of chunks) req.write(c); req.end();
});

export default {
  id: 'E-ROOMSERVICE-03',
  title: 'runRoom slice 3: the web API for rooms: keys, one error shape, rate limits, an OpenAPI document that matches the router, and an SDK',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. The HTTP adapter only translates: a vote over HTTP gives the same settlement as the service on a twin host; every failure has one status and the body { error, code }; the coordinator key guards open and run; the rate limit holds and recovers; the OpenAPI document documents exactly the routes served. The failure that must not happen: an unauthenticated open or run, an error that leaks a stack or a secret, or a documented route that is not served (or the reverse).',
  limits: ['Offline: a real HTTP server on a local port, a simulated attestation provider, a stubbed account-key check.', 'The rate limit uses an injected clock; real-time behaviour under load is not tested.', 'The server speaks plain HTTP on localhost; TLS and a reverse proxy are deployment concerns.', 'One operator plays every member.'],
  async run(ctx) {
    await ctx.step('describe is open; open and run need the coordinator key', async (s) => {
      const svc = new RoomService({ host: mkHost() }); const api = await serve(svc);
      try {
        const d = await api.call('GET', '/v1/rooms');
        s.assert('GET /v1/rooms is 200 with seven programs and no key', d.status === 200 && d.json.programs.length === 7, { actual: d.status });
        s.assert('responses are never cached', d.headers.get('cache-control') === 'no-store');
        s.assert('opening a round without a key is 401 NOT_AUTHORISED', (await api.call('POST', '/v1/rooms/round', ROUND)).status === 401);
        const wrong = await api.call('POST', '/v1/rooms/round', ROUND, { 'x-roost-admin-key': 'nope' });
        s.assert('with a wrong key it is 401 with the code', wrong.status === 401 && wrong.json.code === 'NOT_AUTHORISED', { actual: wrong.json });
        s.assert('running without a key is 401', (await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: VOTE_PARAMS, round: ROUND })).status === 401);
        s.assert('the right key in X-Roost-Admin-Key opens a round', (await api.call('POST', '/v1/rooms/round', ROUND, AUTH)).status === 200);
        s.assert('the right key as a Bearer token also works', (await api.call('POST', '/v1/rooms/round', ROUND, { authorization: `Bearer ${ADMIN_KEY}` })).status === 200);
        s.assert('a key that is a prefix of the real one is refused', (await api.call('POST', '/v1/rooms/round', ROUND, { 'x-roost-admin-key': ADMIN_KEY.slice(0, 10) })).status === 401);
      } finally { await api.close(); }
    });

    await ctx.step('a vote over HTTP gives the same settlement as the service on a twin host', async (s) => {
      const host = mkHost(); const api = await serve(new RoomService({ host }));
      const twinHost = mkHost(); const twin = new RoomService({ host: twinHost }); twin.open(ROUND);
      try {
        await api.call('POST', '/v1/rooms/round', ROUND, AUTH);
        for (const i of voteInputs(host)) { const r = await api.call('POST', '/v1/rooms/inputs', i); s.assert(`input ${i.flyerId} accepted with no key`, r.status === 200 && r.json.accepted === true, { actual: r.json }); }
        for (const i of voteInputs(twinHost)) await twin.submit(i);
        const viaHttp = await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }, AUTH);
        const direct = await twin.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
        s.assert('the run is 200', viaHttp.status === 200, { actual: viaHttp.json });
        s.assert('same order hash', viaHttp.json.orderHash === direct.orderHash, { expected: direct.orderHash, actual: viaHttp.json.orderHash });
        s.assert('same allocations and charges', JSON.stringify(viaHttp.json.settlement.args.allocations) === JSON.stringify(direct.settlement.args.allocations) && JSON.stringify(viaHttp.json.settlement.args.charges) === JSON.stringify(direct.settlement.args.charges));
        s.assert('the contract method and nonce are carried through', viaHttp.json.settlement.method === 'settle_batch_charged' && viaHttp.json.settlement.args.attestation_nonce === ROUND.roundNonce);
        const again = await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }, AUTH);
        s.assert('an identical retry returns the identical body', again.text === viaHttp.text);
      } finally { await api.close(); }
    });

    await ctx.step('every failure has one status and the body { error, code }', async (s) => {
      const host = mkHost();
      const boom = { id: 'boom', summary: 'x', params: {}, needsSignedInputs: false, validate: () => true, run: () => { throw new Error('secret-key-0xdeadbeef at /home/ubuntu/near'); } };
      const svc = new RoomService({ host, programs: [...RoomService.defaultPrograms, boom] });
      const api = await serve(svc, { maxBody: 2048 });
      const shape = (r) => r.json && JSON.stringify(Object.keys(r.json).sort()) === JSON.stringify(['code', 'error']);
      try {
        let r = await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }, AUTH);
        s.assert('run before a round is open: 409 ROUND_NOT_OPEN', r.status === 409 && r.json.code === 'ROUND_NOT_OPEN' && shape(r), { actual: r.json });
        await api.call('POST', '/v1/rooms/round', ROUND, AUTH);
        r = await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }, AUTH);
        s.assert('run with no inputs: 409 NO_INPUTS', r.status === 409 && r.json.code === 'NO_INPUTS' && shape(r));
        r = await api.call('POST', '/v1/rooms/run', { program: 'raffle', params: {}, round: ROUND }, AUTH);
        s.assert('unknown program: 404 UNKNOWN_PROGRAM', r.status === 404 && r.json.code === 'UNKNOWN_PROGRAM' && shape(r));
        for (const i of voteInputs(host).slice(0, 3)) await api.call('POST', '/v1/rooms/inputs', i);
        r = await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: { ...VOTE_PARAMS, quorumBps: 99999 }, round: ROUND }, AUTH);
        s.assert('bad parameters: 400 INVALID_PARAMS', r.status === 400 && r.json.code === 'INVALID_PARAMS' && shape(r));
        r = await api.call('POST', '/v1/rooms/inputs', signedInput(host, 'm4.near', { choice: 'A' }, { tamper: true }));
        s.assert('a forged input: 403 NOT_AUTHORISED', r.status === 403 && r.json.code === 'NOT_AUTHORISED' && shape(r), { actual: r.json });
        r = await api.call('POST', '/v1/rooms/run', { program: 'boom', params: {}, round: ROUND }, AUTH);
        s.assert('an unexpected failure: 500 INTERNAL', r.status === 500 && r.json.code === 'INTERNAL' && shape(r), { actual: r.json });
        s.assert('with no secret, path or stack in the body', !/secret|deadbeef|\/home\/|\bat \w/.test(r.text), { actual: r.text });
        await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: VOTE_PARAMS, round: ROUND }, AUTH);
        r = await api.call('POST', '/v1/rooms/run', { program: 'ballot', params: { ...VOTE_PARAMS, share: '0.02' }, round: ROUND }, AUTH);
        s.assert('a different run after a decided vote: 409 ALREADY_SIGNED', r.status === 409 && r.json.code === 'ALREADY_SIGNED' && shape(r), { actual: r.json });
        r = await api.call('GET', '/v1/rooms/nope');
        s.assert('unknown route under /v1/rooms: 404 NOT_FOUND in the same shape', r.status === 404 && r.json.code === 'NOT_FOUND' && shape(r));
        r = await api.call('GET', '/v1/rooms/run');
        s.assert('wrong method: 405 METHOD_NOT_ALLOWED with an Allow header', r.status === 405 && r.json.code === 'METHOD_NOT_ALLOWED' && r.headers.get('allow') === 'POST' && shape(r), { actual: r.headers.get('allow') });
        r = await api.call('POST', '/v1/rooms/inputs', '{not json');
        s.assert('bad JSON: 400 INVALID_PARAMS', r.status === 400 && r.json.code === 'INVALID_PARAMS' && shape(r));
        r = await api.call('POST', '/v1/rooms/inputs', JSON.stringify({ flyerId: 'x', pad: 'y'.repeat(5000) }));
        s.assert('a body over the limit: 413', r.status === 413 && shape(r), { actual: r.status });
        const big = await chunkedPost(api.base, '/v1/rooms/inputs', ['{"flyerId":"x","pad":"', 'y'.repeat(1500), 'y'.repeat(1500), '"}']);
        s.assert('a streamed body over the limit with no declared length: 413', big.status === 413 && !big.hadLength, { actual: big.status });
        const small = await chunkedPost(api.base, '/v1/rooms/inputs', ['{"flyerId":', '"x"}']);
        s.assert('a small streamed body is read normally: it reaches the service, which refuses it because this round is already settled (409)', small.status === 409, { actual: small.status });
        r = await api.call('POST', '/v1/rooms/inputs', '[1,2,3]');
        s.assert('a body that is not an object: 400', r.status === 400 && shape(r));
        const broken = { describe: () => { throw new Error('secret-key-0xdeadbeef /home/ubuntu/near/secret.js:12'); }, open() {}, submit() {}, run() {} };
        const api2 = await serve(broken);
        try { const b = await api2.call('GET', '/v1/rooms'); s.assert('a failure inside the adapter itself is 500 INTERNAL with no secret, path or stack', b.status === 500 && b.json?.code === 'INTERNAL' && !/secret|deadbeef|\/home\/|\.js:/.test(b.text), { actual: b.text }); } finally { await api2.close(); }
      } finally { await api.close(); }
    });

    await ctx.step('the rate limit holds, tells the client, and recovers', async (s) => {
      let t = 1_000_000; const client = { id: 'A' };
      const api = await serve(new RoomService({ host: mkHost() }), { rate: { limit: 3, windowMs: 60_000, now: () => t }, clientOf: () => client.id });
      try {
        const rs = []; for (let i = 0; i < 3; i += 1) rs.push(await api.call('GET', '/v1/rooms'));
        s.assert('three requests pass', rs.every((r) => r.status === 200));
        s.assert('with the limit and a falling remaining count on each', rs.map((r) => r.headers.get('x-ratelimit-limit')).join() === '3,3,3' && rs.map((r) => r.headers.get('x-ratelimit-remaining')).join() === '2,1,0', { actual: rs.map((r) => r.headers.get('x-ratelimit-remaining')) });
        s.assert('and a reset time', Number(rs[0].headers.get('x-ratelimit-reset')) === Math.ceil((t + 60_000) / 1000));
        const blocked = await api.call('GET', '/v1/rooms');
        s.assert('the fourth is 429 RATE_LIMITED in the standard shape', blocked.status === 429 && blocked.json.code === 'RATE_LIMITED' && Object.keys(blocked.json).sort().join() === 'code,error', { actual: blocked.json });
        s.assert('with Retry-After in seconds', Number(blocked.headers.get('retry-after')) === 60, { actual: blocked.headers.get('retry-after') });
        s.assert('a blocked request does not consume more allowance (remaining stays 0)', blocked.headers.get('x-ratelimit-remaining') === '0');
        client.id = 'B';
        s.assert('another client is unaffected', (await api.call('GET', '/v1/rooms')).status === 200);
        client.id = 'A'; t += 59_999;
        s.assert('just before the window ends, still blocked', (await api.call('GET', '/v1/rooms')).status === 429);
        t += 1;
        s.assert('when the window ends the allowance returns', (await api.call('GET', '/v1/rooms')).status === 200);
        client.id = 'C';
        const e = await api.call('GET', '/v1/rooms/nope'); const u = await api.call('POST', '/v1/rooms/round', ROUND);
        s.assert('rate-limit headers are on 404 and 401 responses too', e.headers.get('x-ratelimit-limit') === '3' && u.headers.get('x-ratelimit-limit') === '3');
      } finally { await api.close(); }
    });

    await ctx.step('behind a proxy: the forwarded address is trusted only from our own proxy, and cannot be forged to dodge the limit', async (s) => {
      const burn = async (api, xff) => (await fetch(api.base + '/v1/rooms', { headers: xff === undefined ? {} : { 'x-forwarded-for': xff } })).status;
      const mk = (opts) => serve(new RoomService({ host: mkHost() }), { rate: { limit: 2, windowMs: 60_000, now: () => 1 }, ...opts });
      let api = await mk({ trustedProxies: ['127.0.0.1'] });
      try {
        s.assert('a client behind our proxy gets its own allowance: two pass', (await burn(api, '1.1.1.1')) === 200 && (await burn(api, '1.1.1.1')) === 200);
        s.assert('its third is limited', (await burn(api, '1.1.1.1')) === 429);
        s.assert('a different forwarded client is not affected by it', (await burn(api, '2.2.2.2')) === 200);
        s.assert('entries an attacker prepends do not help: the address our proxy saw is the last one', (await burn(api, '9.9.9.9, 1.1.1.1')) === 429);
        s.assert('our own proxies in the chain are skipped to find the real client', (await burn(api, '1.1.1.1, 127.0.0.1')) === 429);
        s.assert('a garbage header falls back to the connecting address, not to a free pass', (await burn(api, 'not-an-ip')) === 200 && (await burn(api, 'not-an-ip')) === 200 && (await burn(api, 'also-garbage')) === 429);
        s.assert('IPv6 addresses work', (await burn(api, '2001:db8::1')) === 200 && (await burn(api, '2001:db8::1')) === 200 && (await burn(api, '2001:DB8::1')) === 429);
      } finally { await api.close(); }
      api = await mk({ trustedProxies: ['127.0.0.1'] });
      try {
        s.assert('a chain with an unreadable hop is not believed (the address before it could be forged): it counts against the connecting address', (await burn(api, '8.8.8.8, garbage')) === 200 && (await burn(api, '8.8.8.8, garbage')) === 200 && (await burn(api, undefined)) === 429, { actual: 'see assertion' });
      } finally { await api.close(); }
      api = await mk({ trustedProxies: ['127.0.0.1'] });
      try {
        s.assert('an IPv4-mapped IPv6 address is the same client as the plain IPv4 one', (await burn(api, '5.5.5.5')) === 200 && (await burn(api, '::ffff:5.5.5.5')) === 200 && (await burn(api, '5.5.5.5')) === 429);
      } finally { await api.close(); }
      api = await mk({ trustedProxies: ['::ffff:127.0.0.1'] });
      try {
        s.assert('and a proxy listed in the mapped form is recognised too', (await burn(api, '6.6.6.6')) === 200 && (await burn(api, '6.6.6.6')) === 200 && (await burn(api, '6.6.6.6')) === 429 && (await burn(api, '7.7.7.7')) === 200);
      } finally { await api.close(); }
      api = await mk({});
      try {
        const codes = [await burn(api, '3.3.3.1'), await burn(api, '3.3.3.2'), await burn(api, '3.3.3.3')];
        s.assert('by default the header is ignored: three different forwarded addresses share the real one, so the third is limited', codes.join() === '200,200,429', { actual: codes });
      } finally { await api.close(); }
      api = await mk({ trustedProxies: ['10.9.9.9'] });
      try {
        const codes = [await burn(api, '4.4.4.1'), await burn(api, '4.4.4.2'), await burn(api, '4.4.4.3')];
        s.assert('a proxy list that does not include the connecting address is no better than none', codes.join() === '200,200,429', { actual: codes });
      } finally { await api.close(); }
    });

    await ctx.step('an RFQ\'s plain terms need the flag and the coordinator key', async (s) => {
      const host = mkHost(); const api = await serve(new RoomService({ host }));
      const quotes = { 'maker1.near': { bid: '0.00195', ask: '0.00205' }, 'maker2.near': { bid: '0.0019', ask: '0.002' } };
      try {
        await api.call('POST', '/v1/rooms/round', ROUND, AUTH);
        await api.call('POST', '/v1/rooms/inputs', signedInput(host, 'taker.near', { side: 'buy', units: 10, limit: '0.0022', salt: 'f'.repeat(32) }));
        for (const [id, q] of Object.entries(quotes)) await api.call('POST', '/v1/rooms/inputs', signedInput(host, id, q));
        const params = { taker: 'taker.near', makers: ['maker1.near', 'maker2.near'], pricing: 'first' };
        const plain = await api.call('POST', '/v1/rooms/run', { program: 'rfq', params, round: ROUND }, AUTH);
        s.assert('by default: a settlement and no confidential section', plain.status === 200 && plain.json.settlement && !('confidential' in plain.json) && !/"units"|"notional"/.test(plain.text), { actual: Object.keys(plain.json || {}) });
        const asked = await api.call('POST', '/v1/rooms/run', { program: 'rfq', params, round: ROUND, includeConfidential: true }, AUTH);
        s.assert('with the flag and the key: the terms', asked.json.confidential?.terms?.units === 10, { actual: asked.json.confidential });
        const noKey = await api.call('POST', '/v1/rooms/run', { program: 'rfq', params, round: ROUND, includeConfidential: true });
        s.assert('the flag without the key is 401 and returns nothing', noKey.status === 401 && !/units/.test(noKey.text));
      } finally { await api.close(); }
    });

    await ctx.step('the OpenAPI document matches the router', async (s) => {
      const svc = new RoomService({ host: mkHost() }); const api = await serve(svc);
      try {
        const r = await api.call('GET', '/v1/rooms/openapi.json'); const doc = r.json;
        s.assert('it is served, open, as JSON', r.status === 200 && doc && r.headers.get('content-type').includes('application/json'));
        s.assert('it is OpenAPI 3.0 with an info block', /^3\.0\./.test(doc.openapi) && doc.info?.title && doc.info?.version);
        const served = ROUTES.map((x) => `${x.method} ${x.path}`).sort(); const documented = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`)).sort();
        s.assert('it documents exactly the routes the router serves', JSON.stringify(served) === JSON.stringify(documented), { expected: served, actual: documented });
        s.assert('every operation has a summary and at least one response with a description', Object.values(doc.paths).every((ops) => Object.values(ops).every((o) => o.summary && Object.values(o.responses).length > 0 && Object.values(o.responses).every((x) => x.description || x.$ref))));
        const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/([a-zA-Z]+)\/([A-Za-z0-9_]+)"/g)];
        s.assert('every $ref points at something that exists', refs.length > 0 && refs.every(([, kind, name]) => doc.components?.[kind]?.[name]), { actual: refs.map((x) => x[0]).slice(0, 4) });
        const codes = ['INVALID_PARAMS', 'UNKNOWN_PROGRAM', 'ROUND_NOT_OPEN', 'NO_INPUTS', 'ALREADY_SIGNED', 'NOT_AUTHORISED', 'INTERNAL', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'RATE_LIMITED', 'UNAVAILABLE'];
        s.assert('the error schema lists every code the server can return', JSON.stringify([...doc.components.schemas.Error.properties.code.enum].sort()) === JSON.stringify([...codes].sort()), { actual: doc.components.schemas.Error.properties.code.enum });
        const text = JSON.stringify(doc);
        const allParams = svc.describe().programs.flatMap((p) => Object.keys(p.params).map((k) => `${p.id}.${k}`));
        s.assert('every program parameter appears in the document', allParams.every((pk) => { const [id, k] = pk.split('.'); const prog = doc.components.schemas[`Params_${id}`]; return prog && prog.properties && k in prog.properties; }), { actual: allParams.filter((pk) => { const [id, k] = pk.split('.'); return !doc.components.schemas[`Params_${id}`]?.properties?.[k]; }) });
        s.assert('required parameters are marked required', doc.components.schemas.Params_ballot.required.includes('options') && !doc.components.schemas.Params_ballot.required.includes('rule'));
        s.assert('the coordinator key scheme is declared and used by exactly open and run', doc.components.securitySchemes?.coordinatorKey && doc.paths['/v1/rooms/round'].post.security && doc.paths['/v1/rooms/run'].post.security && !doc.paths['/v1/rooms/inputs'].post.security?.length && !doc.paths['/v1/rooms'].get.security?.length);
        s.assert('the run request lists exactly the available programs', JSON.stringify(doc.components.schemas.RunRequest.properties.program.enum) === JSON.stringify(svc.describe().programs.map((p) => p.id)), { actual: doc.components.schemas.RunRequest.properties.program.enum });
        s.assert('the document names no secret', !text.includes(ADMIN_KEY) && !/secretKey/.test(text));
        const onDisk = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'docs/openapi/rooms.json'), 'utf8'));
        s.assert('the checked-in docs/openapi/rooms.json is the current document (run npm run build:openapi if this fails)', JSON.stringify(onDisk) === JSON.stringify(doc));
        s.assert('buildOpenApi gives the same document as the server', JSON.stringify(buildOpenApi(svc.describe(), ROUTES)) === JSON.stringify(doc));
      } finally { await api.close(); }
    });

    await ctx.step('the SDK returns the same results and raises RoomError with the server\'s code', async (s) => {
      const host = mkHost(); const api = await serve(new RoomService({ host }));
      try {
        const client = new RoomsClient({ baseUrl: api.base, adminKey: ADMIN_KEY });
        const d = await client.describe(); s.assert('describe returns seven programs', d.programs.length === 7);
        await client.openRound(ROUND);
        for (const i of voteInputs(host)) await client.submit(i);
        const r = await client.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
        s.assert('run returns the settlement', r.settlement?.method === 'settle_batch_charged' && r.outcome.winner === 'A');
        const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e instanceof RoomError ? `${e.code}:${e.status}` : `X:${e.message}`; } };
        s.assert('a different run is RoomError ALREADY_SIGNED with status 409', (await codeOf(() => client.run({ program: 'ballot', params: { ...VOTE_PARAMS, share: '0.02' }, round: ROUND }))) === 'ALREADY_SIGNED:409');
        s.assert('an unknown program is UNKNOWN_PROGRAM:404', (await codeOf(() => client.run({ program: 'raffle', params: {}, round: ROUND }))) === 'UNKNOWN_PROGRAM:404');
        const anon = new RoomsClient({ baseUrl: api.base });
        s.assert('a client with no key is refused: NOT_AUTHORISED:401', (await codeOf(() => anon.openRound(ROUND))) === 'NOT_AUTHORISED:401');
        const seen = []; const spy = (url, opts) => { seen.push(opts.headers); return fetch(url, opts); };
        await new RoomsClient({ baseUrl: api.base, fetch: spy }).describe();
        await new RoomsClient({ baseUrl: api.base, adminKey: ADMIN_KEY, fetch: spy }).describe();
        s.assert('a client with no key sends no key header at all', !('x-roost-admin-key' in seen[0]), { actual: Object.keys(seen[0]) });
        s.assert('a client with a key sends exactly that key', seen[1]['x-roost-admin-key'] === ADMIN_KEY);
        const hang = http.createServer(() => { /* never answers */ }); await new Promise((r) => hang.listen(0, '127.0.0.1', r));
        const t0 = Date.now();
        const hung = await codeOf(() => new RoomsClient({ baseUrl: `http://127.0.0.1:${hang.address().port}`, timeoutMs: 300 }).describe());
        hang.closeAllConnections?.(); await new Promise((r) => hang.close(r));
        s.assert('a server that never answers is given up on after the timeout, as INTERNAL', hung.startsWith('INTERNAL') && Date.now() - t0 < 5000, { actual: { hung, ms: Date.now() - t0 } });
        s.assert('a client that cannot reach the server raises an error, not a hang', (await codeOf(() => new RoomsClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1500 }).describe())).startsWith('INTERNAL'));
      } finally { await api.close(); }
    });
  },
};
