import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPlaygroundService } from '../src/playground/service.js';
import { createQueue } from '../src/playground/queue.js';
import { createReviewGate } from '../src/playground/review-gate.js';
import { defaultLines } from '../src/playground/defaults.js';

const ORIGIN = 'https://midge.example';
const ADMIN = 'ADMIN-KEY-THAT-MUST-NEVER-LEAK';
const VKEY = 'ed25519:6E8bkzXvEhS1gYBdeA8tqXbcmW6a9xQe3d4TqVkVdMAv';
const PKEY = 'ab'.repeat(32);

function setup(over = {}) {
  const calls = { review: 0, start: [], approve: [], abandon: [], warm: 0 };
  const state = new Map();
  const round = {
    start: async (p) => { calls.start.push(p); state.set(p.ticket, { state: 'awaiting-approval', detail: { approvalMessage: 'midge-payrun-approval-v1:x', summaryCipherHex: 'cc', orderHash: 'ab'.repeat(32), runId: 'r', round: {}, approver: 'v.t', cast: [] } }); return new Promise(() => {}); },
    approve: async (p) => { calls.approve.push(p); if (over.refuseApproval) throw new Error('roost /payrun/approve answered 400: the approval does not match the pay run waiting for approval'); state.set(p.ticket, { state: 'settling', detail: {} }); return { approved: true }; },
    abandon: (t) => calls.abandon.push(t), status: (t) => state.get(t) || null,
  };
  const room = { getSession: async () => ({ intentPublicKey: 'ii'.repeat(32), settlePublicKey: 'ss'.repeat(32), simulated: false }), getAttestationBundle: async (n) => ({ nonce: n, quote: 'q' }), adminKey: ADMIN };
  const review = over.review || (async (lines) => { calls.review += 1; return { used: true, findings: [], summary: 'ok', questions: [], sent: { lines: [] }, receipt: { model: 'm' }, codeFlags: [], labels: lines.map((_, i) => 'ABCD'[i]) }; });
  const queue = createQueue({ perAddressPerHour: 1000 }); const gate = createReviewGate();
  const chain = { balance: async () => 10n * 10n ** 24n, funderId: 'play.t' };
  const waker = { warm: async () => { calls.warm += 1; }, touch() {}, status: () => ({ state: 'up' }) };
  const handler = createPlaygroundService({ queue, gate, round, room, review, chain, waker, config: { origins: [ORIGIN], trustProxy: false, maxBodyBytes: 16 * 1024 } });
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, queue, gate, base: `http://127.0.0.1:${server.address().port}`, state })));
}
const call = async (base, method, path, body, headers = {}) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
};
const open = async (ctx, session = 'session-1') => { const r = await call(ctx.base, 'POST', '/api/review', { session, lines: defaultLines() }); assert.equal(r.status, 200, r.text); return r; };
const joinBody = (over = {}) => ({ session: 'session-1', visitorPublicKey: VKEY, payeeKeyHex: PKEY, lines: defaultLines(), youIndex: 3, ...over });

test('a review of the lines opens the gate, and one edit closes it again', async () => {
  const ctx = await setup();
  try {
    assert.equal((await call(ctx.base, 'POST', '/api/rounds', joinBody())).status, 403, 'no review yet');
    await open(ctx);
    const joined = await call(ctx.base, 'POST', '/api/rounds', joinBody());
    assert.equal(joined.status, 200); assert.match(joined.json.ticket, /^[0-9a-f]{32}$/);
    const edited = defaultLines(); edited[2].tax = '0';
    const refused = await call(ctx.base, 'POST', '/api/rounds', joinBody({ lines: edited, session: 'session-1' }));
    assert.equal(refused.status, 403); assert.match(refused.json.error, /changed after the last review/);
  } finally { ctx.server.close(); }
});

test('a started round is reported with its state, and the approval summary reaches the page', async () => {
  const ctx = await setup();
  try {
    await open(ctx);
    const { json } = await call(ctx.base, 'POST', '/api/rounds', joinBody());
    await new Promise((r) => setTimeout(r, 30));
    const s = await call(ctx.base, 'GET', `/api/rounds/${json.ticket}`);
    assert.equal(s.status, 200); assert.equal(s.json.step, 'awaiting-approval'); assert.match(s.json.detail.approvalMessage, /^midge-payrun-approval-v1:/);
    const a = await call(ctx.base, 'POST', `/api/rounds/${json.ticket}/approve`, { publicKey: VKEY, signature: 'cd'.repeat(64) });
    assert.equal(a.status, 200); assert.equal(ctx.calls.approve[0].ticket, json.ticket);
  } finally { ctx.server.close(); }
});

test('an approval the room refuses comes back as a plain sentence, and the room\'s status prefix is removed', async () => {
  const ctx = await setup({ refuseApproval: true });
  try {
    await open(ctx);
    const { json } = await call(ctx.base, 'POST', '/api/rounds', joinBody());
    await new Promise((r) => setTimeout(r, 30));
    const a = await call(ctx.base, 'POST', `/api/rounds/${json.ticket}/approve`, { publicKey: VKEY, signature: 'cd'.repeat(64) });
    assert.equal(a.status, 400); assert.equal(a.json.error, 'the approval does not match the pay run waiting for approval');
  } finally { ctx.server.close(); }
});

test('only the site\'s own origin gets cross-site headers, and a preflight is answered', async () => {
  const ctx = await setup();
  try {
    const ok = await call(ctx.base, 'GET', '/api/health', undefined, { origin: ORIGIN });
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    const foreign = await call(ctx.base, 'GET', '/api/health', undefined, { origin: 'https://evil.example' });
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    const pre = await call(ctx.base, 'OPTIONS', '/api/rounds', undefined, { origin: ORIGIN, 'access-control-request-method': 'POST' });
    assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
    const preForeign = await call(ctx.base, 'OPTIONS', '/api/rounds', undefined, { origin: 'https://evil.example' });
    assert.equal(preForeign.headers.get('access-control-allow-origin'), null);
  } finally { ctx.server.close(); }
});

test('a body over 16 KiB is refused with 413 and bad JSON with 400', async () => {
  const ctx = await setup();
  try {
    assert.equal((await call(ctx.base, 'POST', '/api/review', JSON.stringify({ session: 's', pad: 'x'.repeat(20000) }))).status, 413);
    assert.equal((await call(ctx.base, 'POST', '/api/review', '{not json')).status, 400);
  } finally { ctx.server.close(); }
});

test('the room\'s admin key appears in no response', async () => {
  const ctx = await setup();
  try {
    const seen = [];
    seen.push((await call(ctx.base, 'GET', '/api/health')).text);
    seen.push((await call(ctx.base, 'GET', '/api/room')).text);
    seen.push((await call(ctx.base, 'GET', '/api/warm')).text);
    seen.push((await open(ctx)).text);
    const { json } = await call(ctx.base, 'POST', '/api/rounds', joinBody()); seen.push(JSON.stringify(json));
    seen.push((await call(ctx.base, 'GET', `/api/rounds/${json.ticket}`)).text);
    seen.push((await call(ctx.base, 'GET', '/api/nothing')).text);
    for (const t of seen) assert.ok(!t.includes(ADMIN), t.slice(0, 80));
  } finally { ctx.server.close(); }
});

test('the room\'s session and a fresh attestation are proxied, and a bad nonce is refused', async () => {
  const ctx = await setup();
  try {
    const good = await call(ctx.base, 'GET', `/api/room?nonce=${'ab'.repeat(32)}`);
    assert.equal(good.json.session.intentPublicKey, 'ii'.repeat(32)); assert.equal(good.json.attestation.nonce, 'ab'.repeat(32));
    assert.equal((await call(ctx.base, 'GET', '/api/room?nonce=zz')).status, 400);
    assert.equal((await call(ctx.base, 'GET', '/api/room')).json.attestation, null);
  } finally { ctx.server.close(); }
});

test('opening the page wakes the room without waiting for it', async () => {
  const ctx = await setup();
  try { const w = await call(ctx.base, 'GET', '/api/warm'); assert.equal(w.status, 200); await new Promise((r) => setTimeout(r, 10)); assert.equal(ctx.calls.warm, 1); } finally { ctx.server.close(); }
});

test('a failed or unused review is reported as such and does not open the gate', async () => {
  const ctx = await setup({ review: async () => ({ used: false, reason: 'the model did not answer' }) });
  try {
    const r = await call(ctx.base, 'POST', '/api/review', { session: 'session-1', lines: defaultLines() });
    assert.equal(r.status, 200); assert.equal(r.json.used, false);
    assert.equal((await call(ctx.base, 'POST', '/api/rounds', joinBody())).status, 403);
  } finally { ctx.server.close(); }
});

test('bad lines are refused with a sentence before the model is called', async () => {
  const ctx = await setup();
  try {
    const bad = defaultLines(); bad[0].gross = '9';
    const r = await call(ctx.base, 'POST', '/api/review', { session: 'session-1', lines: bad });
    assert.equal(r.status, 400); assert.match(r.json.error, /gross/i); assert.equal(ctx.calls.review, 0);
  } finally { ctx.server.close(); }
});

test('the queue\'s refusals come back with their reasons and a status the page can act on', async () => {
  const ctx = await setup();
  try {
    await open(ctx);
    // fill: one active, eight waiting, from different addresses via x-forwarded-for is ignored without trustProxy, so use the queue directly
    ctx.queue.join({ address: '9.9.9.0', funderBalanceYocto: String(10n ** 25n) }); ctx.queue.next();
    for (let i = 1; i <= 8; i += 1) ctx.queue.join({ address: `9.9.9.${i}`, funderBalanceYocto: String(10n ** 25n) });
    const r = await call(ctx.base, 'POST', '/api/rounds', joinBody());
    assert.equal(r.status, 429); assert.equal(r.json.reason, 'queue-full'); assert.match(r.json.error, /line is full/);
  } finally { ctx.server.close(); }
});
