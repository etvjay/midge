import http from 'node:http';
import net from 'node:net';
import { RoomService } from '../../src/roost-service/room-service.js';
import { createEventHub } from '../../src/roost-service/room-events.js';
import { createRoomHandler } from '../../src/roost-service/room-http.js';
import { RoomsClient } from '../../src/sdk/rooms.js';
import { ROUND, VOTE_PARAMS, ADMIN_KEY, ROLL, mkHost, signedInput, voteInputs } from '../lib/room-fixtures.js';

async function serve(service, opts = {}) {
  const handler = createRoomHandler(service, { adminKey: ADMIN_KEY, ...opts });
  const server = http.createServer(async (req, res) => { if (!(await handler(req, res))) { res.writeHead(418); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections?.(); return new Promise((r) => server.close(r)); } };
}
// A tiny SSE reader on fetch: collects frames { id, event, data } and comments.
async function openStream(base, { lastEventId, headers = {}, query = '' } = {}) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/v1/rooms/events${query}`, { headers: { ...(lastEventId !== undefined ? { 'last-event-id': String(lastEventId) } : {}), ...headers }, signal: ctl.signal });
  const out = { status: res.status, headers: res.headers, frames: [], comments: [], raw: '', closed: false };
  if (!res.body || res.status !== 200) { out.body = await res.text().catch(() => ''); out.close = () => {}; out.waitFor = async () => false; return out; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        const chunk = dec.decode(value, { stream: true }); out.raw += chunk; buf += chunk;
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          if (block.startsWith(':')) { out.comments.push(block); continue; }
          const f = {}; for (const line of block.split('\n')) { const m = /^(\w+): ?(.*)$/.exec(line); if (m) f[m[1]] = m[2]; }
          if (f.event) out.frames.push({ id: Number(f.id), event: f.event, data: JSON.parse(f.data) });
        }
      }
    } catch { /* aborted */ } finally { out.closed = true; }
  })();
  out.close = () => ctl.abort();
  out.waitFor = async (pred, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred(out)) return true; await new Promise((r) => setTimeout(r, 15)); } return pred(out); };
  return out;
}

export default {
  id: 'E-ROOMSERVICE-05',
  title: 'runRoom slice 5: a live event stream (SSE) that shows a round happening and leaks nothing sealed',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. The stream shows round_opened, input_accepted (a count) and round_run (program, decided, order hash) and nothing else, replays what a reconnecting client missed from a ring of the last 100, caps its clients, cleans up after each, and keeps the rooms API otherwise unchanged. The failure that must not happen: a flyer id, ciphertext, choice or trade term in any frame, or a leaked subscriber after a client leaves.',
  limits: ['Offline, a real HTTP server and a real streaming client on a local port.', 'A slow consumer that never reads is not simulated (the stream is dropped if its write buffer grows past a bound; that branch is covered by a unit-level check only where noted).', 'Replay is from memory: a restart of the room loses the ring.', 'One operator plays every member.'],
  async run(ctx) {
    await ctx.step('a vote shows up on the stream in order, with only the safe fields', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host }); const api = await serve(svc);
      const st = await openStream(api.base);
      try {
        s.assert('the stream is 200 text/event-stream, no-store, with a retry hint', st.status === 200 && st.headers.get('content-type').startsWith('text/event-stream') && st.headers.get('cache-control') === 'no-store', { actual: [st.status, st.headers.get('content-type')] });
        svc.open(ROUND);
        const inputs = voteInputs(host); for (const i of inputs) await svc.submit(i);
        const run = await svc.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
        await st.waitFor((x) => x.frames.some((f) => f.event === 'round_run'));
        const names = st.frames.map((f) => f.event);
        s.assert('the order is round_opened, five input_accepted, round_run', JSON.stringify(names) === JSON.stringify(['round_opened', ...Array(5).fill('input_accepted'), 'round_run']), { actual: names });
        s.assert('input_accepted carries only a running count: 1 to 5', st.frames.filter((f) => f.event === 'input_accepted').map((f) => JSON.stringify(f.data)).join() === [1, 2, 3, 4, 5].map((n) => JSON.stringify({ count: n })).join(), { actual: st.frames.filter((f) => f.event === 'input_accepted').map((f) => f.data) });
        const ran = st.frames.at(-1).data;
        s.assert('round_run carries exactly the program, whether it decided, and the order hash', JSON.stringify(Object.keys(ran).sort()) === JSON.stringify(['decided', 'orderHash', 'program']) && ran.program === 'ballot' && ran.decided === true && ran.orderHash === run.orderHash, { actual: ran });
        s.assert('ids rise by one from the first event', st.frames.map((f) => f.id).join() === [1, 2, 3, 4, 5, 6, 7].join(), { actual: st.frames.map((f) => f.id) });
        const leaks = [...ROLL, 'outsider.near', ...inputs.map((i) => i.cipherTextHex), ...inputs.map((i) => i.signature), ...inputs.map((i) => i.publicKey), 'ra.near', 'rb.near', '"choice"', 'winner', 'quorum', 'settle_batch', run.settlement.args.enclave_signature].filter((x) => st.raw.includes(x));
        s.assert('the raw stream contains no member id, ciphertext, signature, key, choice, winner, recipient or settlement signature', leaks.length === 0, { actual: leaks });
      } finally { st.close(); await api.close(); }
    });

    await ctx.step('a run that decides nothing says so; an RFQ\'s terms never appear', async (s) => {
      let host = mkHost(); let svc = new RoomService({ host }); let api = await serve(svc); let st = await openStream(api.base);
      try {
        svc.open(ROUND); for (const i of voteInputs(host, ['A', 'A', 'B', 'B', 'abstain'])) await svc.submit(i);
        await svc.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
        await st.waitFor((x) => x.frames.some((f) => f.event === 'round_run'));
        const ran = st.frames.at(-1).data;
        s.assert('a tie is reported as decided false, with no order hash', ran.decided === false && ran.orderHash === null, { actual: ran });
      } finally { st.close(); await api.close(); }
      host = mkHost(); svc = new RoomService({ host }); api = await serve(svc); st = await openStream(api.base);
      try {
        svc.open(ROUND);
        await svc.submit(signedInput(host, 'taker.near', { side: 'buy', units: 10, limit: '0.0022', salt: 'f'.repeat(32) }));
        for (const [id, q] of Object.entries({ 'maker1.near': { bid: '0.00195', ask: '0.00205' }, 'maker2.near': { bid: '0.0019', ask: '0.002' } })) await svc.submit(signedInput(host, id, q));
        await svc.run({ program: 'rfq', params: { taker: 'taker.near', makers: ['maker1.near', 'maker2.near'], pricing: 'first' }, round: ROUND, includeConfidential: true });
        await st.waitFor((x) => x.frames.some((f) => f.event === 'round_run'));
        s.assert('even when the caller asked for the terms, the stream has no units, price, side or notional', !/units|price|notional|"side"|buy|0\.002/.test(st.raw.replace(/orderHash":"[0-9a-f]+"/g, '')), { actual: st.raw.slice(-300) });
      } finally { st.close(); await api.close(); }
    });

    await ctx.step('an identical retry does not publish the round twice', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host }); const api = await serve(svc); const st = await openStream(api.base);
      try {
        svc.open(ROUND); for (const i of voteInputs(host)) await svc.submit(i);
        await svc.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND }); await svc.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
        await st.waitFor((x) => x.frames.some((f) => f.event === 'round_run')); await new Promise((r) => setTimeout(r, 120));
        s.assert('exactly one round_run', st.frames.filter((f) => f.event === 'round_run').length === 1, { actual: st.frames.map((f) => f.event) });
        const refused = st.frames.length;
        await svc.submit(signedInput(host, 'm1.near', { choice: 'B' }, { seq: 5 })).catch(() => {});
        await new Promise((r) => setTimeout(r, 100));
        s.assert('a refused input publishes nothing', st.frames.length === refused, { actual: st.frames.length });
      } finally { st.close(); await api.close(); }
    });

    await ctx.step('a reconnecting client is caught up from the ring of the last 100', async (s) => {
      const hub = createEventHub({ size: 100 }); const svc = new RoomService({ host: mkHost(), events: hub }); const api = await serve(svc);
      try {
        for (let i = 1; i <= 150; i += 1) hub.publish('input_accepted', { count: i });
        let st = await openStream(api.base, { lastEventId: 140 });
        await st.waitFor((x) => x.frames.length >= 10);
        s.assert('after Last-Event-ID 140 it gets exactly events 141 to 150, in order', st.frames.map((f) => f.id).join() === Array.from({ length: 10 }, (_, i) => 141 + i).join(), { actual: st.frames.map((f) => f.id) });
        st.close();
        st = await openStream(api.base, { lastEventId: 0 }); await st.waitFor((x) => x.frames.length >= 100); await new Promise((r) => setTimeout(r, 60));
        s.assert('from the start it gets only the 100 still held: 51 to 150', st.frames.length === 100 && st.frames[0].id === 51 && st.frames.at(-1).id === 150, { actual: [st.frames.length, st.frames[0]?.id, st.frames.at(-1)?.id] });
        st.close();
        st = await openStream(api.base); await new Promise((r) => setTimeout(r, 100));
        s.assert('with no Last-Event-ID it gets no history, only what comes next', st.frames.length === 0);
        hub.publish('round_opened', { x: 1 }); await st.waitFor((x) => x.frames.length === 1);
        s.assert('and then the new event, id 151', st.frames[0]?.id === 151);
        st.close();
        st = await openStream(api.base, { headers: { 'last-event-id': '' } }); await new Promise((r) => setTimeout(r, 100));
        s.assert('an empty Last-Event-ID header is treated as none, not as 0', st.status === 200 && st.frames.length === 0, { actual: st.frames.length });
        st.close();
        st = await openStream(api.base, { query: '?lastEventId=147' }); await st.waitFor((x) => x.frames.length >= 4);
        s.assert('the ?lastEventId= form works for clients that cannot set the header: 148 to 151 (151 is the event published a moment ago)', st.frames.map((f) => f.id).join() === '148,149,150,151', { actual: st.frames.map((f) => f.id) });
        st.close();
        st = await openStream(api.base, { lastEventId: 'banana' }); await new Promise((r) => setTimeout(r, 100));
        s.assert('a Last-Event-ID that is not a number is treated as none', st.status === 200 && st.frames.length === 0);
        st.close();
      } finally { await api.close(); }
    });

    await ctx.step('limits, heartbeat and cleanup', async (s) => {
      const hub = createEventHub({ size: 10 }); const svc = new RoomService({ host: mkHost(), events: hub });
      const api = await serve(svc, { maxStreams: 2, heartbeatMs: 40 });
      try {
        const a = await openStream(api.base); const b = await openStream(api.base);
        s.assert('two streams are accepted', a.status === 200 && b.status === 200 && hub.size === 2, { actual: hub.size });
        const c = await openStream(api.base);
        s.assert('the third is 503 UNAVAILABLE with Retry-After', c.status === 503 && JSON.parse(c.body).code === 'UNAVAILABLE' && Number(c.headers.get('retry-after')) > 0, { actual: [c.status, c.body] });
        s.assert('the refused one subscribed nothing', hub.size === 2);
        s.assert('an idle stream gets a keepalive comment', await a.waitFor((x) => x.comments.length >= 1, 1500), { actual: a.comments });
        a.close(); await new Promise((r) => setTimeout(r, 150));
        s.assert('when a client leaves its subscription is gone', hub.size === 1, { actual: hub.size });
        const d = await openStream(api.base);
        s.assert('and the freed place can be used', d.status === 200 && hub.size === 2);
        b.close(); d.close(); await new Promise((r) => setTimeout(r, 150));
        s.assert('after everyone leaves there are no subscribers', hub.size === 0, { actual: hub.size });
      } finally { await api.close(); }
      const limited = await serve(svc, { rate: { limit: 2, windowMs: 60_000, now: () => 1 }, clientOf: () => 'x' });
      try {
        const one = await openStream(limited.base); const two = await openStream(limited.base); const three = await openStream(limited.base);
        s.assert('opening a stream counts against the rate limit', one.status === 200 && two.status === 200 && three.status === 429, { actual: [one.status, two.status, three.status] });
        one.close(); two.close();
      } finally { await limited.close(); }
    });

    await ctx.step('a finished stream leaves no timer behind, and a client that never reads is dropped', async (s) => {
      // Unref'd timers are invisible to getActiveResourcesInfo, so watch setInterval/clearInterval themselves for this step.
      const live = new Set(); const si = globalThis.setInterval; const ci = globalThis.clearInterval;
      globalThis.setInterval = (...a) => { const h = si(...a); live.add(h); return h; };
      globalThis.clearInterval = (h) => { live.delete(h); return ci(h); };
      const hub = createEventHub({ size: 5 }); const svc = new RoomService({ host: mkHost(), events: hub });
      const api = await serve(svc, { heartbeatMs: 30, maxStreams: 5 });
      try {
        const base = live.size;
        const many = await Promise.all([1, 2, 3, 4].map(() => openStream(api.base)));
        s.assert('four open streams hold four heartbeat timers', live.size === base + 4, { actual: [base, live.size] });
        many.forEach((m) => m.close()); await new Promise((r) => setTimeout(r, 200));
        s.assert('when they close, every heartbeat timer is cleared', live.size === base, { actual: [base, live.size] });
        // a raw socket that sends the request and then never reads
        const sock = net.connect(Number(new URL(api.base).port), '127.0.0.1');
        await new Promise((r) => sock.once('connect', r)); sock.pause();
        sock.write('GET /v1/rooms/events HTTP/1.1\r\nHost: x\r\n\r\n');
        const t0 = Date.now(); while (Date.now() - t0 < 2000 && hub.size < 1) await new Promise((r) => setTimeout(r, 10));
        s.assert('it is subscribed', hub.size === 1, { actual: hub.size });
        const pad = 'y'.repeat(60_000);
        for (let i = 0; i < 600 && hub.size === 1; i += 1) { hub.publish('input_accepted', { count: i, pad }); if (i % 20 === 0) await new Promise((r) => setTimeout(r, 5)); }
        const t1 = Date.now(); while (Date.now() - t1 < 3000 && hub.size > 0) await new Promise((r) => setTimeout(r, 20));
        s.assert('the stream that never reads is dropped once its buffer passes 1 MiB', hub.size === 0, { actual: hub.size });
        sock.destroy();
        const fresh = await openStream(api.base); s.assert('and its place is free again', fresh.status === 200 && hub.size === 1); fresh.close();
      } finally { globalThis.setInterval = si; globalThis.clearInterval = ci; await api.close(); }
    });

    await ctx.step('the hub: a broken subscriber does not stop the others', async (s) => {
      const hub = createEventHub({ size: 5 }); const got = [];
      hub.subscribe(() => { throw new Error('boom'); }); const off = hub.subscribe((e) => got.push(e.id));
      hub.publish('a', {}); hub.publish('b', {});
      s.assert('both events reached the healthy subscriber', got.join() === '1,2', { actual: got });
      off(); hub.publish('c', {});
      s.assert('after unsubscribing it gets nothing more', got.join() === '1,2');
      s.assert('since(id) returns only later events and respects the ring size', JSON.stringify(hub.since(1).map((e) => e.id)) === '[2,3]' && createEventHub({ size: 2 }).since(0).length === 0);
      const small = createEventHub({ size: 3 }); for (let i = 0; i < 5; i += 1) small.publish('x', { i });
      s.assert('the ring keeps only the newest 3', small.since(0).map((e) => e.id).join() === '3,4,5');
    });

    await ctx.step('the SDK can follow the stream', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host }); const api = await serve(svc);
      try {
        const client = new RoomsClient({ baseUrl: api.base, adminKey: ADMIN_KEY }); const got = []; const ctl = new AbortController();
        const done = client.subscribe((e) => got.push(e), { signal: ctl.signal });
        await new Promise((r) => setTimeout(r, 100));
        await client.openRound(ROUND); for (const i of voteInputs(host)) await client.submit(i); await client.run({ program: 'ballot', params: VOTE_PARAMS, round: ROUND });
        const t0 = Date.now(); while (Date.now() - t0 < 3000 && !got.some((e) => e.event === 'round_run')) await new Promise((r) => setTimeout(r, 20));
        ctl.abort(); await done.catch(() => {});
        s.assert('it delivers the same seven events with parsed data and ids', got.map((e) => e.event).join() === 'round_opened,input_accepted,input_accepted,input_accepted,input_accepted,input_accepted,round_run' && got.every((e) => Number.isInteger(e.id)) && got.at(-1).data.decided === true, { actual: got.map((e) => e.event) });
        const late = []; const c2 = new AbortController();
        const d2 = client.subscribe((e) => late.push(e.id), { lastEventId: 5, signal: c2.signal });
        await new Promise((r) => setTimeout(r, 200)); c2.abort(); await d2.catch(() => {});
        s.assert('with lastEventId 5 it is caught up on 6 and 7', late.join() === '6,7', { actual: late });
      } finally { await api.close(); }
    });
  },
};
