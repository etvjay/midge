// Lead 9, Task 1: the escrow reader asks several RPC providers for each bidder's escrow at one pinned block and fails closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEscrowReader } from '../src/roost-service/escrow-reader.js';

const NOW = 1_800_000_000_000;
const HASH = 'H'.repeat(44);
const YOCTO = (n) => `${n}000000000000000000000000`;

/** A stub JSON-RPC node: balances per account, optional per-node behaviour. */
function node(url, balances, opts = {}) {
  return async (reqUrl, init) => {
    if (reqUrl !== url) return null;
    const body = JSON.parse(init.body);
    opts.log?.push({ url, method: body.method, params: body.params });
    if (opts.fail) throw new Error('node down');
    if (opts.hang) return new Promise(() => {});
    if (body.method === 'block') {
      if (body.params.block_id !== undefined && body.params.block_id !== HASH && body.params.block_id !== (opts.knownHash ?? HASH)) return json({ error: { message: 'UNKNOWN_BLOCK' } });
      return json({ result: { header: { height: opts.height ?? 777, hash: HASH, timestamp: String((opts.blockTime ?? NOW) * 1_000_000) } } });
    }
    if (body.method === 'query' && body.params.method_name === 'get_syndicate') {
      const g = opts.group === undefined ? { epoch_start_block: 700, timeout_blocks: 100, release_policy: { settle_deadline_block: 900 } } : opts.group;
      return json({ result: { result: [...Buffer.from(JSON.stringify(g))], block_height: opts.height ?? 777, block_hash: opts.replyHash ?? HASH } });
    }
    if (body.method === 'query') {
      const args = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString());
      const v = balances[args.account_id] ?? YOCTO(0).replace(/^0+/, '0');
      return json({ result: { result: [...Buffer.from(JSON.stringify(v))], block_height: opts.height ?? 777, block_hash: opts.replyHash ?? HASH } });
    }
    return json({ error: { message: 'unknown method' } });
  };
}
const json = (o) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, ...o }) });
const net = (...nodes) => async (url, init) => { for (const n of nodes) { const r = await n(url, init); if (r) return r; } throw new Error(`no node at ${url}`); };
const reader = (fetchImpl, extra = {}) => createEscrowReader({ rpcUrls: ['https://a.rpc', 'https://b.rpc'], contractId: 'c.near', fetchImpl, now: () => NOW, ...extra });
const B = { 'a.near': YOCTO(10), 'b.near': YOCTO(2) };

test('when every provider agrees it returns the block and each account\'s escrow', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', B)));
  const out = await r.read('grp', ['a.near', 'b.near']);
  assert.deepEqual(out, { blockHeight: 777, blockHash: HASH, blockTimeMs: NOW, escrows: { 'a.near': YOCTO(10), 'b.near': YOCTO(2) }, exitsOpenFromBlock: 800 });
});

test('every provider is asked about the same block', async () => {
  const log = [];
  await reader(net(node('https://a.rpc', B, { log }), node('https://b.rpc', B, { log }))).read('grp', ['a.near']);
  const queries = log.filter((l) => l.method === 'query' && l.params.method_name === 'get_escrow');
  assert.equal(queries.length, 2);
  assert.ok(queries.every((q) => q.params.block_id === HASH && q.params.method_name === 'get_escrow' && q.params.account_id === 'c.near'));
});

test('one provider down means the read fails (all must agree by default)', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', B, { fail: true })));
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow/);
});

test('two providers that disagree on one account means the read fails', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', { ...B, 'a.near': YOCTO(11) })));
  await assert.rejects(() => r.read('grp', ['a.near', 'b.near']), /could not read escrow.*disagree/);
});

test('with minAgree 1 a single failed provider is tolerated', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', B, { fail: true })), { minAgree: 1 });
  assert.equal((await r.read('grp', ['a.near'])).escrows['a.near'], YOCTO(10));
});

test('a block older than maxAgeMs is rejected when the providers agree on it', async () => {
  const r = reader(net(node('https://a.rpc', B, { blockTime: NOW - 61_000 }), node('https://b.rpc', B, { blockTime: NOW - 61_000 })), { maxAgeMs: 60_000 });
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow.*old/);
});

test('providers that disagree about the time of the block fail the read', async () => {
  const r = reader(net(node('https://a.rpc', B, { blockTime: NOW - 61_000 }), node('https://b.rpc', B)), { maxAgeMs: 60_000 });
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow.*disagree/);
});

test('a provider that never answers hits the timeout instead of hanging', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', B, { hang: true })), { timeoutMs: 60 });
  const t0 = Date.now();
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow/);
  assert.ok(Date.now() - t0 < 2000);
});

test('an id that is not a NEAR account is never sent to a provider and reads as zero', async () => {
  const log = [];
  const out = await reader(net(node('https://a.rpc', B, { log }), node('https://b.rpc', B, { log }))).read('grp', ['a.near', 'x:y', 'UPPER.near', 'a b', '']);
  assert.equal(out.escrows['a.near'], YOCTO(10));
  for (const bad of ['x:y', 'UPPER.near', 'a b', '']) assert.equal(out.escrows[bad], '0', `${JSON.stringify(bad)} reads as zero`);
  const sent = log.filter((l) => l.method === 'query' && l.params.method_name === 'get_escrow').map((l) => JSON.parse(Buffer.from(l.params.args_base64, 'base64').toString()).account_id);
  assert.deepEqual([...new Set(sent)], ['a.near']);
});

test('with no accounts it reads the block but asks for no escrow', async () => {
  const log = [];
  const out = await reader(net(node('https://a.rpc', B, { log }), node('https://b.rpc', B, { log }))).read('grp', []);
  assert.deepEqual(out.escrows, {});
  assert.equal(log.filter((l) => l.method === 'query' && l.params.method_name === 'get_escrow').length, 0);
});

test('50 accounts are read with bounded concurrency, not 50 at once', async () => {
  let inFlight = 0; let peak = 0;
  const inner = node('https://a.rpc', {});
  const slow = async (url, init) => { const body = JSON.parse(init.body); if (body.method === 'query') { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; } return inner(url, init); };
  const accounts = Array.from({ length: 50 }, (_, i) => `m${i}.near`);
  await createEscrowReader({ rpcUrls: ['https://a.rpc'], contractId: 'c.near', fetchImpl: slow, now: () => NOW, concurrency: 10 }).read('grp', accounts);
  assert.ok(peak <= 10, `peak concurrency ${peak}`);
});

test('construction rejects missing URLs and a minAgree larger than the number of URLs', () => {
  assert.throws(() => createEscrowReader({ rpcUrls: [], contractId: 'c.near' }), /rpcUrls/);
  assert.throws(() => createEscrowReader({ rpcUrls: ['https://a.rpc'], contractId: 'c.near', minAgree: 2 }), /minAgree/);
});

// ---- Amendment, Task 3d: the group's exit timing is read at the same block ----
test('it reports the first block at which any member could leave: the earlier of timer end and deadline', async () => {
  const mk = (group) => reader(net(node('https://a.rpc', B, { group }), node('https://b.rpc', B, { group })));
  assert.equal((await mk({ epoch_start_block: 700, timeout_blocks: 100, release_policy: { settle_deadline_block: 900 } }).read('grp', ['a.near'])).exitsOpenFromBlock, 800);
  assert.equal((await mk({ epoch_start_block: 700, timeout_blocks: 100, release_policy: { settle_deadline_block: 750 } }).read('grp', ['a.near'])).exitsOpenFromBlock, 750);
});

test('a group that does not exist is an error, not zero balances', async () => {
  const r = reader(net(node('https://a.rpc', B, { group: null }), node('https://b.rpc', B, { group: null })));
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow.*does not exist/);
});

test('providers that disagree about the exit timing fail the read', async () => {
  const g1 = { epoch_start_block: 700, timeout_blocks: 100, release_policy: { settle_deadline_block: 900 } };
  const r = reader(net(node('https://a.rpc', B, { group: g1 }), node('https://b.rpc', B, { group: { ...g1, timeout_blocks: 5 } })));
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow.*disagree/);
});

test('malformed timing fields make the read fail instead of guessing', async () => {
  const r = reader(net(node('https://a.rpc', B, { group: { epoch_start_block: 'x' } }), node('https://b.rpc', B, { group: { epoch_start_block: 'x' } })));
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow/);
});


// ---- Review of lead 9, I2: no single provider picks and vouches for the block ----
test('every provider is asked for the block by its hash, not just the first', async () => {
  const log = [];
  await reader(net(node('https://a.rpc', B, { log }), node('https://b.rpc', B, { log }))).read('grp', ['a.near']);
  const byHash = log.filter((l) => l.method === 'block' && l.params.block_id === HASH);
  assert.deepEqual(byHash.map((l) => l.url).sort(), ['https://a.rpc', 'https://b.rpc']);
});

test('a provider that reports a different height for the same block fails the read', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', B, { height: 700 })));
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow/);
});

test('a provider that does not know the block fails the read', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', B, { knownHash: 'other' , replyHash: HASH })));
  const ok = await r.read('grp', ['a.near']).then(() => true, () => false);
  assert.equal(ok, true, 'a provider that does know the hash is fine');
  const unknown = reader(net(node('https://a.rpc', B), (url, init) => (url === 'https://b.rpc' ? Promise.resolve({ ok: true, status: 200, json: async () => ({ error: { message: 'UNKNOWN_BLOCK' } }) }) : null)));
  await assert.rejects(() => unknown.read('grp', ['a.near']), /could not read escrow/);
});

test('a reply that is not from the block asked about fails the read', async () => {
  const r = reader(net(node('https://a.rpc', B), node('https://b.rpc', B, { replyHash: 'SOMEOTHER' })));
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow/);
});

test('a pinned block is used instead of asking for the latest, and the age check still applies', async () => {
  const log = [];
  const out = await reader(net(node('https://a.rpc', B, { log }), node('https://b.rpc', B, { log }))).read('grp', ['a.near'], { blockHash: HASH });
  assert.equal(out.blockHash, HASH);
  assert.ok(!log.some((l) => l.method === 'block' && l.params.finality === 'final'), 'no request for the latest block');
  const old = reader(net(node('https://a.rpc', B, { blockTime: NOW - 61_000 }), node('https://b.rpc', B, { blockTime: NOW - 61_000 })), { maxAgeMs: 60_000 });
  await assert.rejects(() => old.read('grp', ['a.near'], { blockHash: HASH }), /too old/);
});

// ---- Review of lead 9, minors: time is bounded in total, and a timed-out call is aborted ----
test('a timed-out request is aborted, not left running', async () => {
  let aborted = false;
  const hang = (url, init) => { if (url !== 'https://b.rpc') return null; return new Promise((_, rej) => { init.signal?.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }); }); };
  const r = reader(net(node('https://a.rpc', B), hang), { timeoutMs: 40 });
  await assert.rejects(() => r.read('grp', ['a.near']), /could not read escrow/);
  assert.equal(aborted, true);
});

test('the whole read has a deadline, however many accounts there are', async () => {
  const slow = async (url, init) => { await new Promise((r) => setTimeout(r, 30)); return node('https://a.rpc', {})(url, init); };
  const accounts = Array.from({ length: 50 }, (_, i) => `m${i}.near`);
  const r = createEscrowReader({ rpcUrls: ['https://a.rpc'], contractId: 'c.near', fetchImpl: slow, now: () => NOW, concurrency: 1, totalTimeoutMs: 200, timeoutMs: 1000 });
  const t0 = Date.now();
  await assert.rejects(() => r.read('grp', accounts), /too long|deadline/);
  assert.ok(Date.now() - t0 < 1500);
});
