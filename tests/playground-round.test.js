import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../src/playground/round.js';
import { defaultLines } from '../src/playground/defaults.js';
import { generateClientKey } from '../src/enclave/e2ee.js';
import { nearKeyPair } from '../src/roost-service/signed-input.js';

const FUNDER = 'play.f.testnet';
const NEAR = 10n ** 24n;

// A fake chain with just the contract behaviour the round depends on: hatch, deposit, settle, exit, prune, and accounts that can be created and deleted.
function fakeChain({ failOn = null } = {}) {
  const accounts = new Map(); const groups = new Map(); const sent = [];
  const chain = {
    contractId: 'c.f.testnet', funderId: FUNDER, funder: { accountId: FUNDER }, accounts, groups, sent,
    accountIdFor: (p) => `${p}.${FUNDER}`,
    keys: new Map(),
    derive: (id) => { if (!chain.keys.has(id)) { const k = nearKeyPair(); chain.keys.set(id, { keyPair: { toString: () => k.secretKey, getPublicKey: () => ({ toString: () => k.publicKey }) }, publicKey: k.publicKey }); } return chain.keys.get(id); },
    handleFor: (id) => ({ id, account: { accountId: id }, keyPair: chain.derive(id).keyPair }),
    async createAccount({ prefix, publicKey }) { const id = `${prefix}.${FUNDER}`; accounts.set(id, { publicKey }); return { id, account: publicKey ? null : { accountId: id } }; },
    async deleteAccount(h) { accounts.delete(h.id); return true; },
    async exists(id) { return accounts.has(id); },
    async view(method, args) {
      if (method !== 'get_syndicate') throw new Error(`fake chain has no ${method}`);
      const g = groups.get(args.syndicate_id); if (!g) return null;
      return { epoch: g.epoch, round_nonce: g.nonce, total_escrow: String(g.escrow), is_settling: false, status: g.status };
    },
    async waitFor(fn) { for (let i = 0; i < 5; i += 1) { const v = await fn(); if (v) return v; } throw new Error('timed out'); },
    async send(account, method, args, { deposit = 0n } = {}) {
      sent.push({ from: account.accountId, method, args });
      if (failOn === method) return { ok: false, hash: null, error: `${method} failed` };
      if (method === 'hatch') { groups.set(args.syndicate_id, { epoch: 0, nonce: 'n0', escrow: 0n, status: 'Active', employer: null }); return { ok: true, hash: 'H-hatch' }; }
      if (method === 'deposit') { const g = groups.get(args.syndicate_id); g.escrow += deposit; g.employer = account.accountId; return { ok: true, hash: 'H-dep' }; }
      if (method === 'settle_batch_charged') { const g = groups.get(args.syndicate_id); g.escrow -= args.allocations.reduce((a, x) => a + BigInt(x.amount), 0n); if (g.escrow === 0n) g.status = 'Settled'; return { ok: true, hash: 'H-settle' }; }
      if (method === 'hatch_out') { const g = groups.get(args.syndicate_id); g.escrow = 0n; g.status = 'AbortedRefunded'; return { ok: true, hash: 'H-out' }; }
      if (method === 'prune_syndicate') { const g = groups.get(args.syndicate_id); if (!['Settled', 'AbortedRefunded'].includes(g.status)) return { ok: false, error: 'not finished' }; groups.delete(args.syndicate_id); return { ok: true, hash: 'H-prune' }; }
      return { ok: true, hash: 'H-other' };
    },
  };
  return chain;
}

function fakeRoom({ refuseApproval = false } = {}) {
  const intent = generateClientKey(); const calls = [];
  let approved = false; let current = null;
  return {
    calls,
    async getSession() { return { intentPublicKey: intent.publicKeyHex, settlePublicKey: 'ee'.repeat(32) }; },
    async openRound(r) { calls.push(['openRound', r]); return r; },
    async submitSignedIntent(p) { calls.push(['submit', p.flyerId]); return { accepted: true }; },
    async runPayrun(p) {
      calls.push(['runPayrun', p]); approved = false;
      // The pay run releases exactly the gross total (0.18), which is what the employer deposited, so the group ends Settled.
      const allocations = [{ recipient: p.taxAddress, amount: String(13n * NEAR / 100n) }, { recipient: p.approver, amount: String(5n * NEAR / 100n) }];
      current = { orderHash: 'ab'.repeat(32), allocations, charges: [{ member: p.employer, amount: String(18n * NEAR / 100n) }] };
      return { outcome: { approval: { required: true, approver: p.approver } }, ...current, statements: { payees: Object.fromEntries(p.__payees.map((a) => [a, { cipherHex: `slip-${a}` }])), approver: { cipherHex: 'summary-cipher' } } };
    },
    async approvePayrun(p) { calls.push(['approve', p]); if (refuseApproval || p.orderHash !== current.orderHash) throw new Error('roost /payrun/approve answered 400: the approval does not match the pay run waiting for approval'); approved = true; return { approved: true }; },
    async signSettlement() { calls.push(['sign']); if (!approved) throw new Error('this pay run needs its approver\'s sign-off'); return { signature: 'sig' }; },
  };
}

const VISITOR_KEY = 'ed25519:6E8bkzXvEhS1gYBdeA8tqXbcmW6a9xQe3d4TqVkVdMAv';
const visitor = { visitorPublicKey: VISITOR_KEY, payeeKeyHex: generateClientKey().publicKeyHex, youIndex: 3 };
const mkRound = (over = {}) => {
  const chain = over.chain || fakeChain(); const room = over.room || fakeRoom();
  const states = []; const ledger = { rows: new Map(), add(r) { this.rows.set(r.id, r); }, remove(id) { this.rows.delete(id); }, all() { return [...this.rows.values()]; } };
  // Delegates on every call, so a test can replace a method on `room` after the round exists. The fake needs the payee addresses to key the payslips.
  const wrapped = { getSession: (...a) => room.getSession(...a), openRound: (...a) => room.openRound(...a), submitSignedIntent: (...a) => room.submitSignedIntent(...a), approvePayrun: (...a) => room.approvePayrun(...a), signSettlement: (...a) => room.signSettlement(...a),
    runPayrun: (p) => room.runPayrun({ ...p, __payees: [...chain.accounts.keys()].filter((k) => /a[123]\.|v\./.test(k)) }) };
  const round = createRound({ chain, room: wrapped, keyCheck: async () => true, ledger, onState: (t, s, d) => states.push([s, d]), approvalTimeoutMs: over.approvalTimeoutMs ?? 5000, sleep: async () => {} });
  return { chain, room, round, states, ledger };
};
const names = (states) => states.map(([s]) => s);

test('a whole round: accounts, group, deposit, sealed run, approval by the visitor, settlement, and cleanup that leaves only the visitor\'s account', async () => {
  const { chain, room, round, states, ledger } = mkRound();
  await round.sweepStartup();
  const ticket = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  await round.waitFor(ticket, 'awaiting-approval');
  const wait = states.find(([s]) => s === 'awaiting-approval')[1];
  assert.match(wait.approvalMessage, /^midge-payrun-approval-v1:c\.f\.testnet:pg-/);
  assert.equal(wait.summaryCipherHex, 'summary-cipher');
  assert.ok(wait.orderHash);
  assert.equal(chain.groups.get(wait.round.syndicateId).escrow, 18n * NEAR / 100n, 'the employer deposited exactly the gross total');
  await round.approve({ ticket, publicKey: VISITOR_KEY, signature: 'aa'.repeat(64) });
  const result = await done;
  assert.equal(result.settleTx, 'H-settle'); assert.equal(result.orderHash, wait.orderHash);
  assert.match(result.visitorAccount, new RegExp(`\\.${FUNDER.replace(/\./g, '\\.')}$`));
  assert.equal(result.payslipCipherHex, `slip-${result.visitorAccount}`);
  assert.ok(result.cast.some((c) => c.role === 'er') && result.cast.some((c) => c.role === 'you' && c.id === result.visitorAccount));
  await round.idle();
  assert.deepEqual([...chain.accounts.keys()], [result.visitorAccount], 'only the visitor\'s account survives');
  assert.equal(chain.groups.size, 0, 'the group was pruned');
  assert.equal(ledger.all().length, 0, 'nothing is left in the ledger');
  assert.deepEqual(names(states).slice(0, 4), ['creating-accounts', 'hatching', 'depositing', 'sealing']);
  assert.ok(names(states).includes('settling') && names(states).at(-1) === 'done');
  assert.equal(room.calls.filter((c) => c[0] === 'runPayrun')[0][1].approver, result.visitorAccount);
});

test('an approval the room refuses is reported, nothing settles, and the visitor can try again', async () => {
  const { chain, room, round } = mkRound();
  await round.sweepStartup();
  const ticket = 'b'.repeat(32);
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  await round.waitFor(ticket, 'awaiting-approval');
  const original = room.approvePayrun.bind(room);
  let calls = 0; room.approvePayrun = async (p) => { calls += 1; if (calls === 1) throw new Error('roost /payrun/approve answered 400: the approval does not match the pay run waiting for approval'); return original(p); };
  await assert.rejects(round.approve({ ticket, publicKey: VISITOR_KEY, signature: 'bad' }), /does not match/);
  assert.ok(!chain.sent.some((s) => s.method === 'settle_batch_charged'), 'nothing was settled');
  await round.approve({ ticket, publicKey: VISITOR_KEY, signature: 'good' });
  assert.equal((await done).settleTx, 'H-settle');
});

test('a failure while hatching deletes the accounts already created and keeps the visitor\'s, which only the visitor can delete', async () => {
  const chain = fakeChain({ failOn: 'hatch' });
  const { round, ledger } = mkRound({ chain });
  await round.sweepStartup();
  await assert.rejects(round.start({ ticket: 'c'.repeat(32), ...visitor, lines: defaultLines() }), /hatch failed/);
  await round.idle();
  assert.deepEqual([...chain.accounts.values()].filter((a) => !a.publicKey), [], 'every service-held account is gone');
  assert.equal([...chain.accounts.values()].filter((a) => a.publicKey === VISITOR_KEY).length, 1, 'the visitor\'s account stays');
  assert.equal(ledger.all().length, 0);
});

test('abandoning during approval takes the deposit back out, prunes the group and deletes the accounts', async () => {
  const { chain, round } = mkRound();
  await round.sweepStartup();
  const ticket = 'd'.repeat(32);
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  await round.waitFor(ticket, 'awaiting-approval');
  assert.ok([...chain.groups.values()][0].escrow > 0n);
  round.abandon(ticket);
  await assert.rejects(done, /abandoned|did not approve/i);
  await round.idle();
  assert.equal(chain.groups.size, 0);
  assert.ok(chain.sent.some((s) => s.method === 'hatch_out'), 'the employer exited the group');
  assert.equal([...chain.accounts.keys()].length, 1, 'only the visitor\'s account remains');
});

test('no approval within the time limit ends the round the same way', async () => {
  const { chain, round } = mkRound({ approvalTimeoutMs: 30 });
  await round.sweepStartup();
  const done = round.start({ ticket: 'e'.repeat(32), ...visitor, lines: defaultLines() });
  await assert.rejects(done, /did not approve/i);
  await round.idle();
  assert.equal(chain.groups.size, 0);
});

test('a round cannot start before the start-up sweep has run', async () => {
  const { round } = mkRound();
  await assert.rejects(round.start({ ticket: 'f'.repeat(32), ...visitor, lines: defaultLines() }), /start-up/i);
});

test('the start-up sweep cleans up what a crashed process left in the ledger', async () => {
  const chain = fakeChain();
  const { round, ledger } = mkRound({ chain });
  chain.accounts.set(`old1.${FUNDER}`, {}); chain.accounts.set(`old2.${FUNDER}`, {});
  chain.groups.set('pg-old', { epoch: 0, nonce: 'n', escrow: 5n, status: 'Active', employer: `old1.${FUNDER}` });
  ledger.add({ kind: 'account', id: `old1.${FUNDER}` }); ledger.add({ kind: 'account', id: `old2.${FUNDER}` }); ledger.add({ kind: 'group', id: 'pg-old', employer: `old1.${FUNDER}` });
  await round.sweepStartup();
  assert.equal(chain.accounts.size, 0); assert.equal(chain.groups.size, 0); assert.equal(ledger.all().length, 0);
});

test('lines that the visitor edited into something unusable are refused before any account exists', async () => {
  const { chain, round } = mkRound();
  await round.sweepStartup();
  const lines = defaultLines(); lines[0].gross = '5';
  await assert.rejects(round.start({ ticket: '1'.repeat(32), ...visitor, lines }), /gross/i);
  assert.equal(chain.accounts.size, 0);
});
