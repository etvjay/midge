import { QueueRefusal } from './queue.js';
import { validateLines } from './defaults.js';

/**
 * The playground's HTTP interface, for node:http. All answers are JSON, and every error is a sentence a visitor can read.
 *
 *   GET  /api/health                      the line and the room, for the page's status strip
 *   GET  /api/warm                        wakes the room if it is stopped; answers at once
 *   GET  /api/room[?nonce=<64 hex>]       the room's public session (keys) and, with a nonce, a fresh attestation, proxied
 *   POST /api/review                      { session, lines } -> the model's review, checked by code; opens the gate for exactly those lines
 *   POST /api/rounds                      { session, visitorPublicKey, payeeKeyHex, lines, youIndex } -> { ticket, position }
 *   GET  /api/rounds/:ticket              the state, and for the page what it needs at each step
 *   POST /api/rounds/:ticket/approve      { publicKey, signature } over the approval message
 *   POST /api/rounds/:ticket/abandon      gives the turn up
 *
 * Nothing here touches the room's admin key: the room client holds it and this file only calls its methods.
 */
const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const REASON_STATUS = { 'queue-full': 429, 'address-limit': 429, 'daily-cap': 429, 'funder-low': 503 };
const plain = (msg) => String(msg ?? '').replace(/^roost \S+ answered \d{3}: /, '').replace(/^\[[A-Z ]+REJECT\]\s*/, '').slice(0, 300);

export function createPlaygroundService({ queue, gate, round, room, review, chain, waker = null, config }) {
  const pending = new Map(); // ticket -> params for the round, until its turn
  const origins = new Set(config.origins || []);
  const maxBody = config.maxBodyBytes ?? 16 * 1024;

  function pump() {
    const ticket = queue.next(); if (!ticket) return;
    const params = pending.get(ticket); pending.delete(ticket);
    waker?.touch();
    round.start({ ticket, ...params }).then(() => queue.finish(ticket, { ok: true }), (e) => queue.finish(ticket, { ok: false, reason: e?.message })).finally(() => { waker?.touch(); pump(); });
  }
  function sweep() { for (const t of queue.sweep()) { pending.delete(t); round.abandon(t); } pump(); }

  const clientAddress = (req) => {
    if (config.trustProxy) { const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (f) return f; }
    return req.socket.remoteAddress || 'unknown';
  };
  const readBody = (req) => new Promise((resolve) => {
    let size = 0; const chunks = []; let tooBig = false;
    req.on('data', (c) => { size += c.length; if (size > maxBody) tooBig = true; else chunks.push(c); });
    req.on('end', () => { if (tooBig) return resolve({ error: 413 }); if (chunks.length === 0) return resolve({ body: {} }); try { resolve({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { resolve({ error: 400 }); } });
    req.on('error', () => resolve({ error: 400 }));
  });

  const handler = async (req, res) => {
    const origin = req.headers.origin;
    const cors = origin && origins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' } : { vary: 'Origin' };
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors }); res.end(JSON.stringify(obj)); };
    const fail = (code, error, extra = {}) => send(code, { error, ...extra });
    try {
      const url = new URL(req.url, 'http://playground');
      const path = url.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

      if (req.method === 'GET' && path === '/api/health') return send(200, { ok: true, active: queue.activeTicket() !== null, room: waker?.status?.() ?? null });
      if (req.method === 'GET' && path === '/api/warm') { Promise.resolve(waker?.warm?.()).catch(() => {}); return send(200, { room: waker?.status?.() ?? null }); }
      if (req.method === 'GET' && path === '/api/room') {
        const nonce = url.searchParams.get('nonce');
        if (nonce !== null && !HEX64.test(nonce)) return fail(400, 'The nonce must be 32 bytes of hex.');
        let session; let attestation = null;
        try { session = await room.getSession(); if (nonce) attestation = await room.getAttestationBundle(nonce); } catch { return fail(502, 'The room did not answer. It may still be starting. Please try again in a moment.'); }
        return send(200, { session, attestation });
      }

      if (req.method === 'POST' && path === '/api/review') {
        const { body, error } = await readBody(req);
        if (error) return fail(error, error === 413 ? 'That request is too large.' : 'That request is not valid JSON.');
        if (!SESSION.test(String(body.session))) return fail(400, 'A session id of 8 to 64 letters and digits is needed.');
        const v = validateLines(body.lines); if (!v.ok) return fail(400, v.problem);
        try { gate.reserve({ session: body.session }); } catch (e) { return fail(429, e.message); }
        let result;
        try { result = await review(body.lines); } catch (e) { result = { used: false, reason: `The review failed: ${plain(e.message)}` }; }
        if (result?.used === true) gate.record({ session: body.session, lines: body.lines, result });
        return send(200, result ?? { used: false, reason: 'The review returned nothing.' });
      }

      if (req.method === 'POST' && path === '/api/rounds') {
        const { body, error } = await readBody(req);
        if (error) return fail(error, error === 413 ? 'That request is too large.' : 'That request is not valid JSON.');
        if (!SESSION.test(String(body.session))) return fail(400, 'A session id of 8 to 64 letters and digits is needed.');
        const v = validateLines(body.lines); if (!v.ok) return fail(400, v.problem);
        if (typeof body.visitorPublicKey !== 'string' || !HEX64.test(String(body.payeeKeyHex))) return fail(400, 'Your public key and your payslip key are needed.');
        const allowed = gate.allow({ session: body.session, lines: body.lines });
        if (!allowed.ok) return fail(403, allowed.reason, { reason: 'gate' });
        let balance;
        try { balance = String(await chain.balance(chain.funderId)); } catch { return fail(503, 'The funding account could not be read. Please try again shortly.'); }
        let joined;
        try { joined = queue.join({ address: clientAddress(req), funderBalanceYocto: balance }); } catch (e) { if (e instanceof QueueRefusal) return fail(REASON_STATUS[e.reason] ?? 429, e.message, { reason: e.reason }); throw e; }
        if (!pending.has(joined.ticket) && queue.state(joined.ticket)?.status === 'waiting') pending.set(joined.ticket, { visitorPublicKey: body.visitorPublicKey, payeeKeyHex: body.payeeKeyHex, lines: body.lines, youIndex: Number.isInteger(body.youIndex) ? body.youIndex : 3 });
        pump();
        return send(200, { ticket: joined.ticket, ...queue.state(joined.ticket) });
      }

      const m = path.match(/^\/api\/rounds\/([0-9a-f]{32})(?:\/(approve|abandon))?$/);
      if (m) {
        const ticket = m[1];
        if (req.method === 'GET' && !m[2]) {
          const q = queue.state(ticket); if (!q) return fail(404, 'That round is not known. It may have expired.');
          queue.touch(ticket);
          const r = round.status(ticket);
          const step = q.status === 'waiting' ? 'waiting' : (r?.state ?? q.status);
          return send(200, { ticket, ...q, step, detail: q.status === 'waiting' ? {} : (r?.detail ?? {}) });
        }
        if (req.method === 'POST' && m[2] === 'approve') {
          const { body, error } = await readBody(req);
          if (error) return fail(error, 'That request is not valid.');
          if (typeof body.publicKey !== 'string' || typeof body.signature !== 'string') return fail(400, 'The approval needs your public key and your signature.');
          try { await round.approve({ ticket, publicKey: body.publicKey, signature: body.signature }); } catch (e) { return fail(400, plain(e.message)); }
          queue.markSigned(ticket);
          return send(200, { approved: true });
        }
        if (req.method === 'POST' && m[2] === 'abandon') { round.abandon(ticket); pending.delete(ticket); queue.finish(ticket, { ok: false, reason: 'abandoned' }); pump(); return send(200, { ok: true }); }
      }
      return fail(404, 'Not found.');
    } catch (e) {
      return fail(500, 'Something went wrong on the server. Please try again.');
    }
  };
  handler.sweep = sweep; handler.pump = pump;
  return handler;
}
